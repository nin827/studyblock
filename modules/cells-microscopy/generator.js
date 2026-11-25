// Cells & Microscopy generator. Uses only the seeded rng passed in by the engine.
//
// Units: m, mm, µm (micrometres, U+00B5 "µ") and nm. 1 mm = 1000 µm, 1 µm = 1000 nm.
// Generation works in the units the question uses; verify() converts everything to nanometres
// (magnification), uses powers of ten (units), simulates doubling (cell division) and counts
// unit cubes (surface area to volume).

// ---------- shared helpers ----------

const clean = (n) => {
  const r = Number(Number(n).toPrecision(12));
  return Object.is(r, -0) ? 0 : r;
};
const roundTo = (n, d) => {
  const f = 10 ** d;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
  return Object.is(r, -0) ? 0 : r;
};
const num = (n) => String(clean(n));
const tolFor = (d) => (d > 0 ? 0.5 * 10 ** -d : 0);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// 4 distinct numeric options (strings): correct + 3 plausible mistakes, topped up nearby.
// d = decimals (null = exact, shown in shortest form).
function numChoices(correct, cands, d, rng, { suffix = "", min = 0, max = Infinity, step } = {}) {
  const r = (v) => (d === null ? clean(v) : roundTo(v, d));
  const st = step ?? (d ? 10 ** -d : 1);
  const fmt = (v) => num(r(v)) + suffix;
  const cStr = fmt(correct);
  const seen = new Set([cStr]);
  const out = [];
  const tryAdd = (v) => {
    if (out.length >= 3 || !Number.isFinite(v)) return;
    const x = r(v);
    if (x <= min || x > max) return;
    const s = fmt(v);
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  cands.forEach(tryAdd);
  for (let k = 1; out.length < 3 && k < 2000; k++) {
    tryAdd(correct + k * st);
    tryAdd(correct - k * st);
  }
  return { answer: cStr, choices: rng.shuffle([cStr, ...out]) };
}

// Typed number (rounded to d places, or exact when d is null) or, sometimes, a 4-option choice.
function finish(base, exact, d, cands, rng, opt = {}) {
  if (rng.next() < (opt.choiceP ?? 0.3)) {
    const { answer, choices } = numChoices(exact, cands, d, rng, opt);
    return { ...base, answerType: "choice", answer, choices, params: { ...base.params, d } };
  }
  return {
    ...base,
    answerType: "number",
    answer: d === null ? clean(exact) : roundTo(exact, d),
    tolerance: d === null ? 0 : tolFor(d),
    params: { ...base.params, d },
  };
}

const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const sup = (n) => String(n).split("").map((c) => SUP[c]).join("");
const pow10 = (e) => `10${sup(e)}`;

// Unit exponents (metres = 10^e).
const EXP = { m: 0, cm: -2, mm: -3, "µm": -6, nm: -9 };
const UNIT_NAME = { m: "metres", cm: "centimetres", mm: "millimetres", "µm": "micrometres", nm: "nanometres" };

// ---------- Magnification ----------

const BIG = [
  // Hand lens / low power; actual sizes in mm.
  { name: "a flea", lo: 15, hi: 30, div: 10 },
  { name: "a water flea (Daphnia)", lo: 10, hi: 30, div: 10 },
  { name: "an ant's head", lo: 5, hi: 15, div: 10 },
  { name: "an amoeba", lo: 20, hi: 60, div: 100 },
  { name: "a Paramecium", lo: 10, hi: 30, div: 100 },
  { name: "a pollen grain", lo: 3, hi: 10, div: 100 },
  { name: "a mosquito larva's head", lo: 5, hi: 12, div: 10 },
];
// Light microscope; actual sizes in µm.
const CELLS = [
  { name: "a red blood cell", lo: 6, hi: 8 },
  { name: "a cheek cell", lo: 40, hi: 70 },
  { name: "an onion epidermis cell", lo: 100, hi: 300 },
  { name: "a palisade cell", lo: 40, hi: 100 },
  { name: "a guard cell", lo: 20, hi: 50 },
  { name: "a nucleus", lo: 5, hi: 15 },
  { name: "a chloroplast", lo: 3, hi: 8 },
  { name: "a yeast cell", lo: 3, hi: 8 },
  { name: "a bacterium", lo: 2, hi: 5 },
  { name: "a white blood cell", lo: 10, hi: 20 },
  { name: "a root hair cell", lo: 100, hi: 300 },
];
// Electron microscope; actual sizes in nm.
const TINY = [
  { name: "a virus particle", lo: 20, hi: 300 },
  { name: "a ribosome", lo: 20, hi: 30 },
  { name: "a mitochondrion", lo: 1000, hi: 3000 },
  { name: "a lysosome", lo: 100, hi: 1000 },
  { name: "a bacteriophage head", lo: 50, hi: 100 },
  { name: "a vesicle", lo: 50, hi: 200 },
];

const MAG_EQ = "`magnification = image size ÷ actual size`, with both sizes in the same unit";

function genMagnification(difficulty, rng) {
  const unknown = rng.pick(["M", "I", "A"]);
  let spec, actualUnit, imageUnit = "mm", M, A, I, d = null, kind = "plain";
  if (difficulty === "easy") {
    spec = rng.pick(BIG);
    actualUnit = "mm";
    M = rng.pick([5, 10, 20, 25, 40, 50, 100, 200]);
    A = rng.int(spec.lo, spec.hi) / spec.div;
    if (M * A > 300) M = rng.pick([5, 10, 20]);
    I = clean(M * A);
  } else if (difficulty === "medium") {
    spec = rng.pick(CELLS);
    actualUnit = "µm";
    A = rng.int(spec.lo, spec.hi);
    const ms = [100, 200, 250, 400, 500, 1000, 1500, 2000].filter((m) => (m * A) / 1000 >= 2 && (m * A) / 1000 <= 250);
    M = rng.pick(ms.length ? ms : [1000]);
    I = clean((M * A) / 1000);
  } else {
    kind = rng.pick(["em", "em", "bar", "multi"]);
    if (kind === "bar" || kind === "multi") return scaleBar(kind, rng);
    spec = rng.pick(TINY);
    actualUnit = "nm";
    if (unknown === "M") {
      A = rng.int(spec.lo, spec.hi);
      I = rng.int(10, 120);
      d = 0;
      M = (I * 1e6) / A;
    } else if (unknown === "I") {
      A = rng.int(spec.lo, spec.hi);
      M = rng.pick([20000, 25000, 40000, 50000, 75000, 100000, 150000, 200000]);
      d = 2;
      I = (M * A) / 1e6;
    } else {
      M = rng.pick([20000, 25000, 40000, 50000, 75000, 100000, 150000, 200000]);
      I = rng.int(50, 1500) / 10;
      d = 0;
      A = (I * 1e6) / M;
    }
  }
  if (!spec) spec = { name: "the specimen" };
  const conv = actualUnit === "mm" ? 1 : actualUnit === "µm" ? 1000 : 1e6; // actual units per mm
  const convTxt =
    actualUnit === "mm" ? "" : actualUnit === "µm" ? "1 mm = 1000 µm" : "1 mm = 1000000 nm";
  const convNote = convTxt ? ` (${convTxt}.)` : "";
  const sameUnit = actualUnit === "mm" ? "Both sizes are already in mm." : `Convert first: ${convTxt}.`;
  const round = d === 0 ? " Round to the nearest whole number." : d === 2 ? " Round to 2 decimal places." : "";
  const what = cap(spec.name);
  let prompt, exact, expl, hints, cands, given;
  if (unknown === "M") {
    exact = M;
    const iConv = clean(I * conv);
    prompt = `${what} is ${num(A)} ${actualUnit} long. In a drawing or micrograph its image is ${num(I)} mm long. What is the magnification? Give just the number (for example 400 for ×400).${round}${convNote}`;
    expl =
      `Use ${MAG_EQ}.\n\n` +
      (actualUnit === "mm" ? "" : `Image size in ${actualUnit}: \`${num(I)} × ${num(conv)}\` = ${num(iConv)} ${actualUnit}.\n\n`) +
      `\`M = ${num(iConv)} ÷ ${num(A)}\` ${resultTxt(exact, d, "")}`;
    hints = [
      `Use ${MAG_EQ}. ${sameUnit}`,
      actualUnit === "mm"
        ? `Divide: \`${num(I)} ÷ ${num(A)}\` (in the calculator: \`_image / _actual\`).`
        : `The image is ${num(iConv)} ${actualUnit}. Now divide by the actual size (in the calculator: \`_image * ${num(conv)} / _actual\`).`,
    ];
    cands = [A / I, I / A, (I * conv) / A / 1000, (I * conv) / A * 10];
    given = [{ label: "_image", value: I }, { label: "_actual", value: A }];
  } else if (unknown === "I") {
    exact = I;
    prompt = `${what} is ${num(A)} ${actualUnit} long. It is drawn or photographed at a magnification of ×${num(M)}. How long is the image, in mm?${round}${convNote}`;
    expl =
      `Rearrange to \`image size = magnification × actual size\`.\n\n\`${num(M)} × ${num(A)}\` = ${num(M * A)} ${actualUnit}` +
      (actualUnit === "mm" ? "" : `, and ${convTxt}, so the image is \`${num(M * A)} ÷ ${num(conv)}\``) +
      ` ${resultTxt(exact, d, " mm")}`;
    hints = [
      "Rearrange the magnification formula: `image size = magnification × actual size`.",
      actualUnit === "mm"
        ? `Multiply \`${num(M)} × ${num(A)}\` (in the calculator: \`_M * _actual\`). The answer is already in mm.`
        : `\`${num(M)} × ${num(A)}\` gives the image size in ${actualUnit}. Convert to mm: ${convTxt}.`,
    ];
    cands = [M * A, A / M, (M * A) / conv / 1000, ((M * A) / conv) * 10];
    given = [{ label: "_M", value: M }, { label: "_actual", value: A }];
  } else {
    exact = A;
    prompt = `The image of ${spec.name} is ${num(I)} mm long at a magnification of ×${num(M)}. What is its actual length, in ${actualUnit}?${round}${convNote}`;
    expl =
      `Rearrange to \`actual size = image size ÷ magnification\`.\n\n` +
      (actualUnit === "mm" ? "" : `Image size in ${actualUnit}: \`${num(I)} × ${num(conv)}\` = ${num(I * conv)} ${actualUnit}.\n\n`) +
      `\`${num(I * conv)} ÷ ${num(M)}\` ${resultTxt(exact, d, " " + actualUnit)}`;
    hints = [
      `Rearrange the formula: \`actual size = image size ÷ magnification\`. ${actualUnit === "mm" ? "Everything is in mm." : `Convert the image to ${actualUnit} first: ${convTxt}.`}`,
      actualUnit === "mm"
        ? `Divide \`${num(I)} ÷ ${num(M)}\` (in the calculator: \`_image / _M\`).`
        : `The image is ${num(I * conv)} ${actualUnit}. Divide by the magnification (in the calculator: \`_image * ${num(conv)} / _M\`).`,
    ];
    cands = [I * M, I / M, (I * conv) / M / 1000, ((I * conv) / M) * 1000];
    given = [{ label: "_image", value: I }, { label: "_M", value: M }];
  }
  const base = {
    prompt,
    explanation: expl,
    hints,
    given,
    params: { sub: "mag", kind: "plain", unknown, values: { I, A, M }, actualUnit },
  };
  return finish(base, exact, d, cands, rng);
}

function resultTxt(exact, d, unit) {
  if (d === null) return `= **${num(exact)}${unit}**`;
  const shown = roundTo(exact, d);
  if (Math.abs(shown - exact) < 1e-9) return `= **${num(shown)}${unit}**`;
  return `≈ ${num(roundTo(exact, 4))}${unit}, which rounds to **${num(shown)}${unit}**`;
}

// Scale bar on a micrograph: bar length on the image (mm) and what it represents (µm).
function scaleBar(kind, rng) {
  const spec = rng.pick(CELLS);
  const barActual = rng.pick([1, 2, 5, 10, 20, 25, 50, 100]);
  const barImage = rng.int(10, 60);
  const cellImage = rng.int(15, 120);
  const M = (barImage * 1000) / barActual;
  const actual = (cellImage * barActual) / barImage;
  const intro = `A micrograph of ${spec.name} has a scale bar ${barImage} mm long, labelled ${barActual} µm. On the micrograph, the ${spec.name.replace(/^an? /, "")} is ${cellImage} mm long. (1 mm = 1000 µm.)`;
  const given = [
    { label: "_bar_image", value: barImage },
    { label: "_bar_actual", value: barActual },
    { label: "_image", value: cellImage },
  ];
  const step1 = `The scale bar gives the magnification: \`${barImage} mm = ${barImage * 1000} µm\`, so \`M = ${barImage * 1000} ÷ ${barActual}\` ${resultTxt(M, 0, "")}.`;
  const step2 = `Actual length = image ÷ magnification: \`${cellImage * 1000} µm ÷ ${num(roundTo(M, 4))}\`. Or by proportion: \`${cellImage} ÷ ${barImage} × ${barActual}\` ${resultTxt(actual, 2, " µm")}.`;
  if (kind === "multi") {
    return {
      prompt: intro,
      answerType: "multi",
      parts: [
        {
          id: "mag", label: "Magnification", ask: "What is the magnification? Give just the number, rounded to the nearest whole number.",
          answerType: "number", answer: roundTo(M, 0), tolerance: 0,
          hint: "Use the scale bar: its image length and its real length must be in the same unit. Convert the bar's image length to µm (`_bar_image * 1000`), then divide by `_bar_actual`.",
        },
        {
          id: "size", label: "Actual size", ask: "What is the actual length of the cell, in µm? Round to 2 decimal places.",
          answerType: "number", answer: roundTo(actual, 2), tolerance: 0.005,
          hint: "The cell is measured on the same micrograph, so it has the same magnification. Convert its image length to µm and divide by the unrounded magnification, or scale by proportion: `_image / _bar_image * _bar_actual`.",
        },
      ],
      explanation: `${step1}\n\n${step2}`,
      given,
      params: { sub: "mag", kind: "bar", barImage, barActual, cellImage },
    };
  }
  const wantSize = rng.next() < 0.6;
  if (wantSize) {
    return finish(
      {
        prompt: `${intro} What is its actual length, in µm? Round to 2 decimal places.`,
        explanation: `${step1}\n\n${step2}`,
        hints: [
          "The scale bar and the cell are on the same micrograph, so they share one magnification.",
          `By proportion: the cell's image is \`${cellImage} ÷ ${barImage}\` times as long as the bar, so its actual length is that many times ${barActual} µm (in the calculator: \`_image / _bar_image * _bar_actual\`).`,
        ],
        given,
        params: { sub: "mag", kind: "bar", want: "size", barImage, barActual, cellImage },
      },
      actual,
      2,
      [(cellImage * barImage) / barActual, (barImage * barActual) / cellImage, actual * 1000, actual / 10],
      rng,
    );
  }
  return finish(
    {
      prompt: `${intro} What is the magnification of the micrograph? Give just the number, rounded to the nearest whole number.`,
      explanation: step1,
      hints: [
        "The scale bar's image length and its real length must be in the same unit before you divide.",
        `Convert the bar's image length to µm: ${barImage} mm × 1000 (in the calculator: \`_bar_image * 1000 / _bar_actual\`).`,
      ],
      given: given.slice(0, 2),
      params: { sub: "mag", kind: "bar", want: "mag", barImage, barActual, cellImage },
    },
    M,
    0,
    [barImage / barActual, barActual / barImage, (cellImage * 1000) / barActual, M / 10],
    rng,
  );
}

// ---------- Units & sizes ----------

function genUnits(difficulty, rng) {
  if (difficulty === "easy") {
    const pairs = [["m", "mm"], ["mm", "µm"], ["µm", "nm"], ["cm", "mm"]];
    const [big, small] = rng.pick(pairs);
    const up = rng.next() < 0.5; // big -> small (multiply)
    const f = 10 ** (EXP[big] - EXP[small]);
    let v;
    if (up) v = rng.pick([rng.int(1, 9), rng.int(11, 99) / 10, rng.int(101, 999) / 100, rng.int(2, 40)]);
    else v = f * rng.pick([rng.int(1, 9), rng.int(11, 99) / 10, rng.int(2, 40)]);
    v = clean(v);
    const from = up ? big : small, to = up ? small : big;
    return unitConv(v, from, to, rng, "easy");
  }
  if (difficulty === "medium") {
    const pairs = [["m", "µm"], ["mm", "nm"], ["cm", "µm"], ["m", "mm"], ["µm", "nm"], ["mm", "µm"]];
    const [big, small] = rng.pick(pairs);
    const up = rng.next() < 0.5;
    const steps = EXP[big] - EXP[small];
    let v;
    if (up) v = steps >= 6 ? rng.int(1, 999) / 1000 : rng.int(1, 999) / 100;
    else v = rng.int(5, 9999) * (steps >= 6 ? 10 ** (steps - 4) : 10 ** Math.max(0, steps - 3));
    v = clean(v);
    const from = up ? big : small, to = up ? small : big;
    const out = clean(v * 10 ** (EXP[from] - EXP[to]));
    if (out < 0.001 || out > 1e7) return unitConv(v, from, to, rng, "medium", true);
    return unitConv(v, from, to, rng, "medium");
  }
  const kind = rng.pick(["stdForm", "stdForm", "times", "fit"]);
  if (kind === "stdForm") return stdForm(rng);
  return compareSizes(kind, rng);
}

function unitConv(v, from, to, rng, level, retry = false) {
  const e = EXP[from] - EXP[to];
  let val = v;
  if (retry) {
    // Keep the answer readable: pick a value that lands between 0.001 and 10 000 000.
    val = e > 0 ? clean(rng.int(1, 99) / 10) : clean(rng.int(1, 99) * 10 ** (-e - 1));
  }
  const exact = clean(val * 10 ** e);
  const factor = 10 ** Math.abs(e);
  const op = e > 0 ? "×" : "÷";
  const chain = [];
  const order = from === "cm" || to === "cm" ? ["cm", "mm", "µm", "nm"] : ["m", "mm", "µm", "nm"];
  const i = order.indexOf(from), j = order.indexOf(to);
  const stepUnits = i < j ? order.slice(i, j + 1) : order.slice(j, i + 1).reverse();
  for (let k = 0; k + 1 < stepUnits.length; k++) {
    const f = stepUnits[k] === "cm" || stepUnits[k + 1] === "cm" ? "10" : "1000";
    chain.push(`${stepUnits[k]} → ${stepUnits[k + 1]}: ${i < j ? "×" : "÷"} ${f}`);
  }
  const rule = chain.join(", ");
  const prompt = `Convert ${num(val)} ${from} to ${to}. (1 m = 1000 mm, 1 mm = 1000 µm, 1 µm = 1000 nm, 1 cm = 10 mm.)`;
  return finish(
    {
      prompt,
      explanation: `Each step between m, mm, µm and nm is a factor of 1000; cm to mm is a factor of 10.\n\n${rule}, so ${op} ${num(factor)} in total.\n\n\`${num(val)} ${op} ${num(factor)}\` = **${num(exact)} ${to}**`,
      hints: [
        `Going from ${UNIT_NAME[from]} to ${UNIT_NAME[to]}, the unit gets ${e > 0 ? "smaller, so the number gets bigger (multiply)" : "bigger, so the number gets smaller (divide)"}.`,
        `Count the steps: ${rule}. ${op === "×" ? "Multiply" : "Divide"} ${num(val)} by the total factor.`,
      ],
      params: { sub: "units", kind: "conv", v: val, from, to },
    },
    exact,
    null,
    [val * 10 ** -e, exact * 1000, exact / 1000, exact * 10, exact / 10],
    rng,
    { min: 0.0009, max: 1e9 },
  );
}

// Standard form of a size in metres (choice: one coefficient, four exponents/coefficients).
function stdForm(rng) {
  const things = [
    ["a virus", "nm", 20, 300],
    ["a ribosome", "nm", 20, 30],
    ["a bacterium", "µm", 1, 5],
    ["a red blood cell", "µm", 6, 8],
    ["a plant cell", "µm", 20, 100],
    ["a cell membrane", "nm", 7, 10],
    ["an amoeba", "mm", 0.2, 0.6],
    ["a frog egg", "mm", 1, 3],
  ];
  const [name, unit, lo, hi] = rng.pick(things);
  let v;
  if (unit === "mm" && hi < 1) v = rng.int(lo * 100, hi * 100) / 100;
  else v = rng.int(lo, hi);
  if (rng.next() < 0.4 && v < 100) v = clean(v + rng.int(1, 9) / 10);
  const metres = v * 10 ** EXP[unit];
  const e = Math.floor(Math.log10(metres) + 1e-9);
  const c = clean(metres / 10 ** e);
  const fmt = (cc, ee) => `${num(cc)} × ${pow10(ee)} m`;
  const correct = fmt(c, e);
  const pool = rng.shuffle([fmt(c, e + 3), fmt(c, e - 3), fmt(c, e + 1), fmt(c, e - 1), fmt(c, -e), fmt(c, e + 6)]);
  const choices = [correct];
  for (const p of pool) if (choices.length < 4 && !choices.includes(p)) choices.push(p);
  return {
    prompt: `${cap(name)} is ${num(v)} ${unit} across. What is this size in metres, in standard form? (1 ${unit} = ${pow10(EXP[unit])} m.)`,
    answerType: "choice",
    answer: correct,
    choices: rng.shuffle(choices),
    explanation:
      `1 ${unit} = ${pow10(EXP[unit])} m, so ${num(v)} ${unit} = ${num(v)} × ${pow10(EXP[unit])} m.\n\n` +
      `Standard form needs a number from 1 to just under 10 in front: ${num(v)} = ${num(c)} × ${pow10(Math.round(Math.log10(v / c)))}, so the power changes to ${pow10(e)}.\n\n` +
      `The answer is **${correct}**.`,
    hints: [
      c === v ? `Replace the unit by its power of ten: 1 ${unit} is ${pow10(EXP[unit])} m. Is the front number already between 1 and 10?` : `Write the size as ${num(v)} × ${pow10(EXP[unit])} m first.`,
      `Move the decimal point so the front number is between 1 and 10. Each place you move it left adds 1 to the power; each place right subtracts 1.`,
    ],
    params: { sub: "units", kind: "std", v, unit },
  };
}

// How many times bigger / how many fit across (two sizes in different units).
function compareSizes(kind, rng) {
  const bigs = [
    ["a cheek cell", 40, 70, "µm"],
    ["an onion cell", 100, 300, "µm"],
    ["a pollen grain", 20, 80, "µm"],
    ["a microscope's field of view", 1, 4, "mm"],
    ["a human hair", 50, 100, "µm"],
    ["a frog egg", 1, 3, "mm"],
  ];
  const smalls = [
    ["a virus", 20, 200, "nm", "viruses"],
    ["a bacterium", 1, 5, "µm", "bacteria"],
    ["a ribosome", 20, 30, "nm", "ribosomes"],
    ["a mitochondrion", 1, 3, "µm", "mitochondria"],
    ["a red blood cell", 6, 8, "µm", "red blood cells"],
  ];
  let big, small, bv, sv, ratio;
  for (let tries = 0; tries < 50; tries++) {
    big = rng.pick(bigs);
    small = rng.pick(smalls);
    bv = rng.int(big[1], big[2]);
    sv = rng.int(small[1], small[2]);
    const bm = bv * 10 ** EXP[big[3]], sm = sv * 10 ** EXP[small[3]];
    ratio = bm / sm;
    if (big[3] !== small[3] && ratio >= 2) break;
  }
  const d = kind === "fit" ? 0 : Number.isInteger(clean(ratio)) ? null : 2;
  const conv = clean(10 ** (EXP[big[3]] - EXP[small[3]]));
  const bigInSmall = clean(bv * conv);
  const prompt =
    kind === "times"
      ? `${cap(big[0])} is ${bv} ${big[3]} across and ${small[0]} is ${sv} ${small[3]} across. How many times wider is ${big[0].replace(/^an? /, "the ")} than ${small[0].replace(/^an? /, "the ")}?${d === 2 ? " Round to 2 decimal places." : ""} (1 mm = 1000 µm, 1 µm = 1000 nm.)`
      : `${cap(big[0])} is ${bv} ${big[3]} across. How many ${small[4]}, each ${sv} ${small[3]} across, would fit side by side across it? Give a whole number (only complete ones count). (1 mm = 1000 µm, 1 µm = 1000 nm.)`;
  const exact = kind === "fit" ? Math.floor(ratio + 1e-9) : ratio;
  return finish(
    {
      prompt,
      explanation:
        `Put both sizes in the same unit: ${bv} ${big[3]} = \`${bv} × ${num(conv)}\` = ${num(bigInSmall)} ${small[3]}.\n\n` +
        `\`${num(bigInSmall)} ÷ ${sv}\` ${kind === "fit" ? `= ${num(roundTo(ratio, 4))}, and only whole ones fit: **${exact}**` : resultTxt(exact, d, "")}`,
      hints: [
        `The sizes are in different units. Convert ${bv} ${big[3]} into ${small[3]} first (1 mm = 1000 µm, 1 µm = 1000 nm).`,
        `Then divide the big size by the small one (in the calculator: \`_big * ${num(conv)} / _small\`).${kind === "fit" ? " Round down: only complete ones fit." : ""}`,
      ],
      given: [{ label: "_big", value: bv }, { label: "_small", value: sv }],
      params: { sub: "units", kind, bv, bu: big[3], sv, su: small[3] },
    },
    exact,
    d,
    [bv / sv, ratio * 1000, ratio / 1000, ratio * 10, Math.ceil(ratio) + (kind === "fit" ? 1 : 0)],
    rng,
  );
}

// ---------- Cell division ----------

const DIV_ASSUME = "Assume ideal conditions: every cell divides once in each doubling time and no cells die.";
const MICROBES = ["a culture of bacteria", "a population of yeast cells", "a bacterial colony", "a culture of E. coli"];

function genDivision(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["cells", "cells", "rounds"]);
    const n = rng.int(2, 10);
    const n0 = rng.pick([1, 1, 2, 3, 5, 10]);
    const what = rng.pick(["A cell", "A fertilised egg cell", "A yeast cell", "A bacterium"]);
    if (kind === "rounds") {
      const N = 2 ** n;
      return finish(
        {
          prompt: `${what} divides by ${what === "A bacterium" ? "binary fission" : "mitosis"} into two, and every new cell keeps dividing in the same way. No cells die. How many rounds of division does it take to go from 1 cell to ${N} cells?`,
          explanation: `Each round doubles the number of cells: 1, 2, 4, 8, …, so after n rounds there are 2ⁿ cells.\n\nSolve \`2ⁿ = ${N}\`: **n = ${n}**.`,
          hints: ["Each round of division doubles the number of cells.", `Keep doubling from 1 and count the rounds until you reach ${N}, or ask which power of two equals ${N}.`],
          params: { sub: "division", kind: "rounds", n0: 1, N },
        },
        n,
        0,
        [N / 2, n + 1, n - 1, n * 2],
        rng,
      );
    }
    const exact = n0 * 2 ** n;
    return finish(
      {
        prompt: `${n0 === 1 ? what : `${n0} cells`} ${n0 === 1 ? "divides" : "each divide"} by ${what === "A bacterium" && n0 === 1 ? "binary fission" : "mitosis"} ${n} times in a row, and every new cell divides too. No cells die. How many cells are there at the end?`,
        explanation: `Each division doubles the number of cells, so after ${n} divisions there are \`${n0} × 2^${n}\` cells.\n\n\`2^${n}\` = ${2 ** n}, so the answer is **${exact}**.`,
        hints: [
          "Each round of division doubles the number of cells.",
          `Double ${n0} a total of ${n} times, or work out \`${n0} × 2^${n}\` (in the calculator: \`_N0 * 2^_n\`).`,
        ],
        given: [{ label: "_N0", value: n0 }, { label: "_n", value: n }],
        params: { sub: "division", kind: "cells", n0, n },
      },
      exact,
      0,
      [n0 * 2 * n, n0 * 2 ** (n - 1), n0 * 2 ** (n + 1), n0 * n * n],
      rng,
    );
  }

  const g = rng.pick([15, 20, 20, 25, 30, 30, 40, 45, 60]);
  const who = rng.pick(MICROBES);
  if (difficulty === "medium") {
    const n = rng.int(3, 12);
    const T = n * g;
    const n0 = rng.pick([1, 2, 5, 10, 20, 50, 100]);
    const inHours = T % 60 === 0 && rng.next() < 0.6;
    const tTxt = inHours ? `${T / 60} hour${T === 60 ? "" : "s"}` : `${T} minutes`;
    const kind = rng.pick(["gens", "pop", "pop"]);
    const intro = `${cap(who)} doubles every ${g} minutes. ${DIV_ASSUME} It starts with ${n0} cell${n0 === 1 ? "" : "s"}.`;
    const convLine = inHours ? `${tTxt} = ${T} minutes. ` : "";
    if (kind === "gens") {
      return finish(
        {
          prompt: `${intro} How many generations (doublings) happen in ${tTxt}?`,
          explanation: `${convLine}Generations = time ÷ doubling time: \`${T} ÷ ${g}\` = **${n}**.`,
          hints: [`${inHours ? "Convert the time to minutes first. " : ""}Each generation takes ${g} minutes.`, `Divide the total time in minutes by the doubling time (in the calculator: \`_t / _g\`).`],
          given: [{ label: "_t", value: T }, { label: "_g", value: g }],
          params: { sub: "division", kind: "gens", T, g },
        },
        n,
        0,
        [inHours ? T / 60 : n + 1, n - 1, n * 2],
        rng,
      );
    }
    const exact = n0 * 2 ** n;
    return finish(
      {
        prompt: `${intro} How many cells are there after ${tTxt}?`,
        explanation: `${convLine}Generations: \`${T} ÷ ${g}\` = ${n}.\n\nCells: \`${n0} × 2^${n}\` = \`${n0} × ${2 ** n}\` = **${exact}**.`,
        hints: [
          `${inHours ? "Convert the time to minutes. " : ""}Find the number of generations: time ÷ doubling time.`,
          `The population doubles once per generation: multiply the starting number by 2 to the power of the number of generations (in the calculator: \`_N0 * 2^(_t / _g)\`).`,
        ],
        given: [{ label: "_N0", value: n0 }, { label: "_t", value: T }, { label: "_g", value: g }],
        params: { sub: "division", kind: "pop", n0, T, g },
      },
      exact,
      0,
      [n0 * 2 * n, n0 * 2 ** (n - 1), n0 * 2 ** (n + 1), 2 ** n],
      rng,
    );
  }

  // hard
  const kind = rng.pick(["timeExact", "timeAtLeast", "multi", "multi"]);
  const n0 = rng.pick([1, 2, 5, 10, 25, 50, 100, 200]);
  if (kind === "timeExact") {
    const n = rng.int(5, 20);
    const N = n0 * 2 ** n;
    const exactH = (n * g) / 60;
    const d = Number.isInteger(clean(exactH * 100)) ? null : 2;
    return finish(
      {
        prompt: `${cap(who)} doubles every ${g} minutes. ${DIV_ASSUME} How long does it take to grow from ${n0} to ${N} cells, in hours?${d === 2 ? " Round to 2 decimal places." : ""}`,
        explanation: `Number of doublings: \`${N} ÷ ${n0}\` = ${2 ** n} = 2^${n}, so ${n} generations.\n\nTime: \`${n} × ${g}\` = ${n * g} minutes = \`${n * g} ÷ 60\` hours ${resultTxt(exactH, d, " hours")}.`,
        hints: [
          `Find how many times the population doubles: work out \`_N / _N0\` and write it as a power of two.`,
          `Multiply the number of doublings by ${g} minutes, then convert minutes to hours (÷ 60).`,
        ],
        given: [{ label: "_N0", value: n0 }, { label: "_N", value: N }, { label: "_g", value: g }],
        params: { sub: "division", kind, n0, N, g },
      },
      exactH,
      d,
      [n * g, exactH * 2, (n + 1) * g / 60, (n - 1) * g / 60],
      rng,
    );
  }
  // At least a target: count doublings until reaching it.
  let target;
  do {
    target = n0 * rng.int(100, 200000);
  } while (Number.isInteger(Math.log2(target / n0)));
  let gens = 0, pop = n0;
  while (pop < target) { pop *= 2; gens++; } // generation side: simple doubling loop
  const minutes = gens * g;
  const intro = `${cap(who)} doubles every ${g} minutes. ${DIV_ASSUME} It starts with ${n0} cell${n0 === 1 ? "" : "s"}.`;
  const given = [{ label: "_N0", value: n0 }, { label: "_target", value: target }, { label: "_g", value: g }];
  const expl =
    `The population after n generations is \`${n0} × 2ⁿ\`. Find the smallest n with \`${n0} × 2ⁿ ≥ ${target}\`: ` +
    `\`2^${gens - 1}\` × ${n0} = ${n0 * 2 ** (gens - 1)} is too few, and \`2^${gens}\` × ${n0} = ${n0 * 2 ** gens} is enough, so **${gens}** generations.\n\n` +
    `Time: \`${gens} × ${g}\` = **${minutes} minutes**.`;
  const genHint = `Keep doubling ${n0} until you reach at least ${target}, counting the doublings. Or use logs: n = log(\`_target / _N0\`) ÷ log(2) (in the calculator: \`log(_target / _N0) / log(2)\`), then round **up**.`;
  if (kind === "timeAtLeast") {
    return finish(
      {
        prompt: `${intro} How many minutes until there are at least ${target} cells? Count only complete doublings.`,
        explanation: expl,
        hints: [genHint, `Multiply the number of doublings by the doubling time, ${g} minutes.`],
        given,
        params: { sub: "division", kind, n0, target, g },
      },
      minutes,
      0,
      [(gens - 1) * g, (gens + 1) * g, gens, Math.round((target / n0) * g)],
      rng,
      { step: g },
    );
  }
  return {
    prompt: `${intro} The experiment needs at least ${target} cells.`,
    answerType: "multi",
    parts: [
      {
        id: "gens", label: "Generations", ask: "How many complete generations are needed to reach at least that many cells?",
        answerType: "number", answer: gens, tolerance: 0,
        hint: genHint,
      },
      {
        id: "time", label: "Time", ask: "How long does that take, in minutes?",
        answerType: "number", answer: minutes, tolerance: 0,
        hint: `Each generation takes ${g} minutes (\`_g\`). Multiply by your number of generations.`,
      },
    ],
    explanation: expl,
    given,
    params: { sub: "division", kind: "multi", n0, target, g },
  };
}

// ---------- Surface area to volume ----------

const SAV_NOTE = "SA:V is surface area ÷ volume, written as a single number (for example 3 for 3 : 1).";
const sa = (l, w, h) => 2 * (l * w + l * h + w * h);

function genSAV(difficulty, rng) {
  if (difficulty === "easy") {
    const kind = rng.pick(["SA", "V", "ratio"]);
    const s = kind === "ratio" ? rng.pick([2, 3, 4, 5, 6, 8, 10, 12]) : rng.int(2, 12);
    const [thing, u] = rng.pick([["A cube-shaped cell", "µm"], ["A cube-shaped cell", "µm"], ["A cube of agar jelly", "mm"], ["A cube of potato tissue", "mm"]]);
    const intro = `${thing} has sides of ${s} ${u}.`;
    const given = [{ label: "_s", value: s }];
    if (kind === "SA") {
      return finish(
        {
          prompt: `${intro} What is its surface area, in ${u}²?`,
          explanation: `A cube has 6 square faces, each \`${s} × ${s}\` = ${s * s} ${u}².\n\n\`6 × ${s * s}\` = **${6 * s * s} ${u}²**.`,
          hints: ["A cube has 6 identical square faces.", "Work out the area of one face (side × side), then multiply by 6 (in the calculator: `6 * _s^2`)."],
          given,
          params: { sub: "sav", kind, dims: [s, s, s] },
        },
        6 * s * s,
        0,
        [s * s, 4 * s * s, s ** 3, 6 * s],
        rng,
      );
    }
    if (kind === "V") {
      return finish(
        {
          prompt: `${intro} What is its volume, in ${u}³?`,
          explanation: `Volume of a cube = side³.\n\n\`${s} × ${s} × ${s}\` = **${s ** 3} ${u}³**.`,
          hints: ["Volume of a cube = side × side × side.", "Multiply the side length by itself three times (in the calculator: `_s^3`)."],
          given,
          params: { sub: "sav", kind, dims: [s, s, s] },
        },
        s ** 3,
        0,
        [s * s, 6 * s * s, 3 * s, s ** 3 * 2],
        rng,
      );
    }
    return finish(
      {
        prompt: `${intro} What is its surface area to volume ratio? ${SAV_NOTE}`,
        explanation: `Surface area: \`6 × ${s}²\` = ${6 * s * s} ${u}². Volume: \`${s}³\` = ${s ** 3} ${u}³.\n\nSA:V = \`${6 * s * s} ÷ ${s ** 3}\` = **${6 / s}**, so the ratio is ${6 / s} : 1.`,
        hints: ["Work out the surface area (six faces, each side × side) and the volume (side³).", "Divide the surface area by the volume (in the calculator: `6 * _s * _s / (_s * _s * _s)`)."],
        given,
        params: { sub: "sav", kind, dims: [s, s, s] },
      },
      6 / s,
      null,
      [s / 6, 6 * s, 6, 6 / s + 1],
      rng,
    );
  }

  if (difficulty === "medium") {
    let l, w, h;
    do {
      l = rng.int(1, 12);
      w = rng.int(1, 12);
      h = rng.int(1, 12);
    } while (new Set([l, w, h]).size < 2);
    const kind = rng.pick(["SA", "ratio", "ratio"]);
    const A = sa(l, w, h), V = l * w * h;
    const intro = `A cell is modelled as a cuboid ${l} µm × ${w} µm × ${h} µm.`;
    const given = [{ label: "_l", value: l }, { label: "_w", value: w }, { label: "_h", value: h }];
    const saLine = `Surface area: \`2 × (${l} × ${w} + ${l} × ${h} + ${w} × ${h})\` = \`2 × (${l * w} + ${l * h} + ${w * h})\` = ${A} µm².`;
    if (kind === "SA") {
      return finish(
        {
          prompt: `${intro} What is its surface area, in µm²?`,
          explanation: `A cuboid has 3 pairs of identical rectangular faces.\n\n${saLine.replace(`= ${A} µm².`, `= **${A} µm²**.`)}`,
          hints: [
            "A cuboid has 6 faces in 3 identical pairs: l × w, l × h and w × h.",
            "Add the three different face areas and double the total (in the calculator: `2 * (_l * _w + _l * _h + _w * _h)`).",
          ],
          given,
          params: { sub: "sav", kind, dims: [l, w, h] },
        },
        A,
        0,
        [A / 2, V, l * w + l * h + w * h + 1, 6 * l * w],
        rng,
      );
    }
    const exact = A / V;
    return finish(
      {
        prompt: `${intro} What is its surface area to volume ratio? ${SAV_NOTE} Round to 2 decimal places.`,
        explanation: `${saLine}\n\nVolume: \`${l} × ${w} × ${h}\` = ${V} µm³.\n\nSA:V = \`${A} ÷ ${V}\` ${resultTxt(exact, 2, "")}.`,
        hints: [
          "Find the surface area (3 pairs of faces: l × w, l × h, w × h; add them and double) and the volume (l × w × h).",
          "Divide the surface area by the volume (in the calculator: `2 * (_l * _w + _l * _h + _w * _h) / (_l * _w * _h)`). Then round to 2 decimal places.",
        ],
        given,
        params: { sub: "sav", kind, dims: [l, w, h] },
      },
      exact,
      2,
      [V / A, A / 2 / V, (l * w + l * h + w * h) / V + 1, exact * 2],
      rng,
    );
  }

  // hard
  const kind = rng.pick(["largest", "cut", "multi", "multi"]);
  if (kind === "largest") {
    // Four cells (cubes and cuboids); exactly one has the largest SA:V (by at least 0.05).
    let shapes;
    for (let tries = 0; tries < 100; tries++) {
      shapes = [];
      while (shapes.length < 4) {
        const cube = rng.next() < 0.5;
        const dims = cube ? Array(3).fill(rng.int(2, 10)) : [rng.int(1, 10), rng.int(1, 10), rng.int(2, 10)];
        const key = dims.slice().sort((a, b) => a - b).join("x");
        if (!shapes.some((s) => s.key === key)) shapes.push({ dims, key });
      }
      const r = shapes.map((s) => sa(...s.dims) / (s.dims[0] * s.dims[1] * s.dims[2])).sort((a, b) => b - a);
      if (r[0] - r[1] >= 0.05) break;
    }
    const label = (s) => (s.dims[0] === s.dims[1] && s.dims[1] === s.dims[2] ? `a cube with sides of ${s.dims[0]} µm` : `a cuboid ${s.dims.join(" µm × ")} µm`);
    const ratios = shapes.map((s) => sa(...s.dims) / (s.dims[0] * s.dims[1] * s.dims[2]));
    const best = ratios.indexOf(Math.max(...ratios));
    const choices = shapes.map((s) => cap(label(s)));
    return {
      prompt: "Which of these cells has the largest surface area to volume ratio, so it can exchange substances fastest for its size?",
      answerType: "choice",
      answer: choices[best],
      choices,
      explanation:
        `Work out SA:V = surface area ÷ volume for each:\n\n` +
        shapes.map((s, i) => `- ${choices[i]}: \`${sa(...s.dims)} ÷ ${s.dims[0] * s.dims[1] * s.dims[2]}\` ≈ ${num(roundTo(ratios[i], 2))}`).join("\n") +
        `\n\nThe largest is **${choices[best]}**. Small or thin cells have more surface for each unit of volume.`,
      hints: [
        "Work out surface area ÷ volume for each cell. For a cuboid, SA = 2 × (lw + lh + wh) and V = l × w × h.",
        "The biggest cell is not the answer: small or thin shapes have more surface for each unit of volume. Compare the four ratios.",
      ],
      params: { sub: "sav", kind: "largest", shapes: shapes.map((s) => s.dims) },
    };
  }
  if (kind === "cut") {
    const k = rng.int(2, 5);
    const m = rng.int(1, 4);
    const s = k * m;
    return finish(
      {
        prompt: `A cube of tissue with sides of ${s} mm is cut into small cubes with sides of ${m} mm. By what factor does the total surface area increase? (The volume stays the same.)`,
        explanation:
          `Big cube: \`6 × ${s}²\` = ${6 * s * s} mm².\n\n` +
          `Small cubes: \`(${s} ÷ ${m})³\` = ${k ** 3} cubes, each \`6 × ${m}²\` = ${6 * m * m} mm², so ${k ** 3 * 6 * m * m} mm² in total.\n\n` +
          `Factor: \`${k ** 3 * 6 * m * m} ÷ ${6 * s * s}\` = **${k}**.`,
        hints: [
          `Find the surface area of the big cube (6 × side²) and how many small cubes there are: (\`_s / _m\`)³.`,
          "Multiply the number of small cubes by the surface area of one small cube, then divide by the big cube's surface area.",
        ],
        given: [{ label: "_s", value: s }, { label: "_m", value: m }],
        params: { sub: "sav", kind: "cut", s, m },
      },
      k,
      0,
      [k ** 3, k * k, k ** 3 / 6, 2 * k],
      rng,
      { min: 1 },
    );
  }
  // multi: two cube cells, then which exchanges faster
  let a, b;
  do {
    a = rng.int(2, 15);
    b = rng.int(2, 15);
  } while (a === b || Math.abs(6 / a - 6 / b) < 0.02);
  const ra = 6 / a, rb = 6 / b;
  const faster = ra > rb ? "Cell A" : "Cell B";
  return {
    prompt: `Cell A is a cube with sides of ${a} µm. Cell B is a cube with sides of ${b} µm. ${SAV_NOTE}`,
    answerType: "multi",
    parts: [
      {
        id: "a", label: "Cell A", ask: "What is the SA:V of cell A? Round to 2 decimal places.",
        answerType: "number", answer: roundTo(ra, 2), tolerance: 0.005,
        hint: "Surface area = six faces of side × side; volume = side × side × side. Divide (in the calculator: `6 * _a * _a / (_a * _a * _a)`).",
      },
      {
        id: "b", label: "Cell B", ask: "What is the SA:V of cell B? Round to 2 decimal places.",
        answerType: "number", answer: roundTo(rb, 2), tolerance: 0.005,
        hint: "Same method with cell B's side: `6 * _b * _b / (_b * _b * _b)`.",
      },
      {
        id: "faster", label: "Exchange", ask: "Which cell can exchange substances by diffusion faster for its volume?",
        answerType: "choice", answer: faster, choices: ["Cell A", "Cell B"],
        hint: "More surface for each unit of volume means faster exchange per unit volume. Compare your two ratios.",
      },
    ],
    explanation:
      `**Cell A:** \`6 × ${a}² ÷ ${a}³\` = ${6 * a * a} ÷ ${a ** 3} ${resultTxt(ra, 2, "")}.\n\n` +
      `**Cell B:** \`6 × ${b}² ÷ ${b}³\` = ${6 * b * b} ÷ ${b ** 3} ${resultTxt(rb, 2, "")}.\n\n` +
      `**Exchange:** the larger SA:V belongs to **${faster}**, the smaller cube, so it has more membrane for each unit of volume.`,
    given: [{ label: "_a", value: a }, { label: "_b", value: b }],
    params: { sub: "sav", kind: "multi", a, b },
  };
}

// ---------- entry ----------

export function generate({ subtopic, difficulty, rng }) {
  if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  if (subtopic === "magnification") return genMagnification(difficulty, rng);
  if (subtopic === "units") return genUnits(difficulty, rng);
  if (subtopic === "division") return genDivision(difficulty, rng);
  if (subtopic === "sa-volume") return genSAV(difficulty, rng);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// =====================================================================================
// Independent check.
// =====================================================================================

// Surface area and volume by counting unit cubes in an l × w × h block: every face of a unit
// cube that has no neighbour is on the surface.
function countBlock(l, w, h) {
  let faces = 0, cubes = 0;
  const inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < l && y < w && z < h;
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let x = 0; x < l; x++) {
    for (let y = 0; y < w; y++) {
      for (let z = 0; z < h; z++) {
        cubes++;
        for (const [dx, dy, dz] of dirs) if (!inside(x + dx, y + dy, z + dz)) faces++;
      }
    }
  }
  return { area: faces, vol: cubes };
}
const NM = { m: 1e9, cm: 1e7, mm: 1e6, "µm": 1e3, nm: 1 };

function expected(p, partId) {
  switch (p.sub) {
    case "mag": {
      if (p.kind === "plain") {
        // Everything in nanometres: image = M × actual.
        const { I, A, M } = p.values;
        const aNm = A * NM[p.actualUnit];
        const iNm = I * NM.mm;
        if (p.unknown === "M") return { num: iNm / aNm };
        if (p.unknown === "I") return { num: (M * aNm) / NM.mm };
        return { num: iNm / M / NM[p.actualUnit] };
      }
      // Scale bar by proportion in nm.
      const barI = p.barImage * NM.mm, barA = p.barActual * NM["µm"], cellI = p.cellImage * NM.mm;
      const M = barI / barA;
      const want = partId === "mag" ? "mag" : partId === "size" ? "size" : p.want;
      if (want === "mag") return { num: M, d: 0 };
      return { num: (cellI / M) / NM["µm"], d: 2 };
    }
    case "units": {
      if (p.kind === "conv") return { num: (p.v * NM[p.from]) / NM[p.to] };
      if (p.kind === "std") return { std: p.v * NM[p.unit] }; // in nm
      const ratio = (p.bv * NM[p.bu]) / (p.sv * NM[p.su]);
      if (p.kind === "fit") {
        let n = 0;
        while ((n + 1) * p.sv * NM[p.su] <= p.bv * NM[p.bu] * (1 + 1e-12)) n++;
        return { num: n, d: 0 };
      }
      return { num: ratio };
    }
    case "division": {
      const sim = (n0, gens) => {
        let x = n0;
        for (let i = 0; i < gens; i++) x += x; // each cell splits in two
        return x;
      };
      if (p.kind === "cells") return { num: sim(p.n0, p.n), d: 0 };
      if (p.kind === "rounds") {
        let x = p.n0, r = 0;
        while (x < p.N) { x += x; r++; }
        return x === p.N ? { num: r, d: 0 } : null;
      }
      if (p.kind === "gens") return { num: p.T / p.g, d: 0 };
      if (p.kind === "pop") {
        let x = p.n0;
        for (let t = p.g; t <= p.T + 1e-9; t += p.g) x += x;
        return { num: x, d: 0 };
      }
      if (p.kind === "timeExact") {
        let x = p.n0, t = 0;
        while (x < p.N) { x += x; t += p.g; }
        return x === p.N ? { num: t / 60 } : null;
      }
      // at least a target: step minute by minute
      let x = p.n0, t = 0, gens = 0;
      while (x < p.target) { t += p.g; x += x; gens++; }
      if (p.kind === "timeAtLeast") return { num: t, d: 0 };
      return partId === "gens" ? { num: gens, d: 0 } : { num: t, d: 0 };
    }
    case "sav": {
      if (p.kind === "SA" || p.kind === "V" || p.kind === "ratio") {
        const c = countBlock(...p.dims);
        return { num: p.kind === "SA" ? c.area : p.kind === "V" ? c.vol : c.area / c.vol };
      }
      if (p.kind === "cut") {
        const big = countBlock(p.s, p.s, p.s).area;
        const k = p.s / p.m;
        const one = countBlock(p.m, p.m, p.m);
        return { num: (k ** 3 * one.area) / big, d: 0 };
      }
      if (p.kind === "largest") {
        const r = p.shapes.map((d) => {
          const c = countBlock(...d);
          return c.area / c.vol;
        });
        return { largest: r };
      }
      if (p.kind === "multi") {
        const A = countBlock(p.a, p.a, p.a), B = countBlock(p.b, p.b, p.b);
        if (partId === "a") return { num: A.area / A.vol, d: 2 };
        if (partId === "b") return { num: B.area / B.vol, d: 2 };
        return { str: A.area / A.vol > B.area / B.vol ? "Cell A" : "Cell B" };
      }
      return null;
    }
    default:
      return null;
  }
}

const SUP_REV = Object.fromEntries(Object.entries(SUP).map(([k, v]) => [v, k]));

function matches(exp, answer, q, d) {
  if (!exp || answer === undefined || answer === null || answer === "") return false;
  if (q.answerType === "choice") {
    const ch = q.choices;
    if (!Array.isArray(ch) || ch.length < 2 || new Set(ch).size !== ch.length || !ch.includes(String(answer))) return false;
  }
  if (exp.str !== undefined) return String(answer) === exp.str;
  if (exp.std !== undefined) {
    // "c × 10ⁿ m": value in nm must match the stated size.
    const m = String(answer).match(/^([\d.]+) × 10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+) m$/);
    if (!m) return false;
    const c = Number(m[1]);
    const e = Number(m[2].split("").map((ch) => SUP_REV[ch]).join(""));
    if (!(c >= 1 && c < 10)) return false;
    const nm = c * 10 ** (e + 9);
    return Math.abs(nm - exp.std) <= 1e-9 * Math.max(1, exp.std);
  }
  if (exp.largest) {
    const i = q.choices.indexOf(String(answer));
    const max = Math.max(...exp.largest);
    return i >= 0 && Math.abs(exp.largest[i] - max) < 1e-12 && exp.largest.filter((r) => max - r < 0.05).length === 1;
  }
  const x = Number(String(answer).trim());
  if (!Number.isFinite(x)) return false;
  const dd = exp.d !== undefined ? exp.d : d;
  if (dd === null || dd === undefined) return Math.abs(x - exp.num) <= 1e-9 * Math.max(1, Math.abs(exp.num));
  return Math.abs(x - roundTo(exp.num, dd)) <= tolFor(dd) + 1e-9;
}

export function verify(question, answer) {
  const p = question && question.params;
  if (!p) return false;
  if (question.answerType === "multi") {
    if (!answer || typeof answer !== "object" || !Array.isArray(question.parts)) return false;
    return question.parts.every((part) => {
      const exp = expected(p, part.id);
      return matches(exp, answer[part.id], part, part.tolerance ? (part.tolerance === 0.005 ? 2 : 0) : 0);
    });
  }
  if (question.answerType === "choice") {
    const ch = question.choices;
    if (!Array.isArray(ch) || ch.length !== 4 || new Set(ch).size !== 4) return false;
  }
  return matches(expected(p), answer, question, p.d);
}
