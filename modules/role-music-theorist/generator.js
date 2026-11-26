// Music Theorist role-only generator (all four tiers). Uses only the seeded rng passed in by the engine.
// Every question is a multi-part scenario mixing subject skills (keys, chords, intervals, rhythm, ratios).
// Hints and explanations use only values already drawn (no rng calls). verify() recomputes each part by
// another route: the CHECK toolkit of js/lib/music.js (keyboard walking, step patterns, classify,
// identifyChord) and integer arithmetic for timing. Spelled notes and chords are always choice parts.
//
// Subtopics (tiers medium / hard / expert / expert-plus = 2 / 3 / 4 / 4 parts):
//   key-chords      key -> scale -> chord on a degree -> spelling, diatonic or not    (Composer)
//   progression     chord progressions <-> Roman numerals, cadences, keys             (Composer)
//   bar-timing      tempo and time signature -> bar length -> piece length, markings  (Arranger)
//   transposition   transposing notes, keys and instrument parts by an interval       (Arranger)

import {
  note, fmt, fmtList, parseNote, parseInterval, plain, sameNote, pc, TRIAD, SEVENTH, buildChord, noteAbove,
  majorTonic, minorTonic, scaleFromSignature, classify, isInterval, scaleByPattern, identifyChord, fourChoices,
  ordinal, keyboardDistance, intervalSize, intervalName, keyIndex,
} from "../../js/lib/music.js";
import { withPlay, playChord, playProgression, playInterval } from "../../js/lib/audio.js";

// ---------- helpers ----------

import { roundTo } from "../../js/lib/mathutil.js";
function nearHalf(n, d, margin = 0.05) {
  const x = Math.abs(n) * 10 ** d;
  return Math.abs(x - Math.floor(x) - 0.5) < margin;
}
const fmtN = (n, d = 4) => String(roundTo(n, d));
const fixed = (n, d) => roundTo(n, d).toFixed(d);
const givenRows = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const tolOf = (dp) => Number((0.5 * 10 ** -dp).toFixed(dp + 1));
const dpWord = (dp) => (dp === 0 ? "to the nearest whole number" : dp === 1 ? "to 1 decimal place" : `to ${dp} decimal places`);
const TIER_PARTS = { medium: 2, hard: 3, expert: 4, "expert-plus": 4 };
const TRY = 30000;
const tooMany = () => { throw new Error("role-music-theorist: no suitable draw"); };
const CONTEXT = ["a hymn", "a folk song", "a school song", "a film theme", "a jingle", "a lullaby", "a ballad", "a fanfare"];
const DASH = " – ";

function numPart(id, label, ask, val, dp, hint) {
  return { id, label, ask: `${ask}, ${dpWord(dp)}`, answerType: "number", answer: roundTo(val, dp), tolerance: tolOf(dp), hint, _dp: dp };
}
// A whole-number answer that must be exact (counts, bpm, semitones).
function intPart(id, label, ask, val, hint) {
  return { id, label, ask, answerType: "number", answer: val, tolerance: 0, fuzzyNumber: 0, hint };
}
function stableOk(st, dps) {
  const A = st((k, v) => v);
  const B = st((k, v) => (dps[k] === undefined ? v : roundTo(v, dps[k])));
  return Object.keys(dps).every((k) => Number.isFinite(A[k]) && !nearHalf(A[k], dps[k]) && roundTo(A[k], dps[k]) === roundTo(B[k], dps[k]));
}
function finish(prompt, parts, explanation, kind, params, given, hints) {
  const dps = {};
  for (const p of parts) { if (p._dp !== undefined) { dps[p.id] = p._dp; delete p._dp; } }
  return { prompt, answerType: "multi", parts, explanation, params: { kind, dps, ...params }, given: givenRows(given), hints };
}
const yesNo = (id, label, ask, ok, hint) => ({ id, label, ask, answerType: "choice", answer: ok ? "Yes" : "No", choices: ["Yes", "No"], hint });
const choicePart = (id, label, ask, answer, choices, hint) => ({ id, label, ask, answerType: "choice", answer, choices, hint });

// Ticket 022 (mixed distances): at least one wrong option differs from the answer in 2+ columns, and in at
// least one column the answer's value is not the strictly most common one (so counting can't find it).
function segMixed(answer, options) {
  const diff = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
  if (!options.some((t) => diff(t, answer) >= 2)) return false;
  return answer.some((v, i) => {
    const counts = new Map();
    for (const t of options) counts.set(t[i], (counts.get(t[i]) || 0) + 1);
    const mine = counts.get(v) || 0;
    return [...counts].some(([k, c]) => k !== v && c >= mine);
  });
}
// A wrong option differs from the answer in 1 to n−1 columns (1 to 2 when n = 2). The set is redrawn
// until it follows the mixed-distances rule.
function segOptions(rng, answer, opts, n) {
  const key = (a) => a.join(" | ");
  const maxDiff = answer.length === 2 ? 2 : answer.length - 1 || 1;
  for (let attempt = 0; attempt < 40; attempt++) {
    const out = [answer];
    let guard = 0;
    while (out.length < n && guard++ < 400) {
      const c = answer.slice();
      const idx = rng.shuffle(answer.map((_, i) => i)).slice(0, rng.int(1, maxDiff));
      for (const i of idx) { const alt = opts[i].filter((v) => v !== answer[i]); if (alt.length) c[i] = rng.pick(alt); }
      if (!out.some((o) => key(o) === key(c))) out.push(c);
    }
    if (segMixed(answer, out)) return rng.shuffle(out);
  }
  throw new Error("role-music-theorist: no mixed-distance options");
}
function segPart(rng, { id, label, ask, cols, answer, opts, hint, n }) {
  const choices = segOptions(rng, answer, opts, n);
  const extraSegs = [];
  cols.forEach((c, i) => { for (const v of new Set(opts[i])) if (v !== answer[i]) extraSegs.push([i, v]); });
  return { id, label, ask, answerType: "choice", choiceCols: cols, choices, answer, extraSegs, hint };
}

// ---------- music helpers (build side) ----------

const QUAL_OF_DEGREE = ["major", "minor", "minor", "major", "major", "minor", "diminished"];
const SUF = { major: "", minor: "m", diminished: "dim" };
const QUALITIES = ["major", "minor", "diminished"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const romanOf = (d, q) => (q === "major" ? ROMAN[d - 1] : ROMAN[d - 1].toLowerCase() + (q === "diminished" ? "°" : ""));
const sigPhrase = (k) => (k === 0 ? "no sharps or flats" : `${Math.abs(k)} ${k > 0 ? "sharp" : "flat"}${Math.abs(k) === 1 ? "" : "s"}`);
const kindOfK = (k) => (k > 0 ? "sharps" : k < 0 ? "flats" : "none");
const keyName = (t) => `${fmt(t)} major`;
const scaleOf = (k) => scaleFromSignature(k, "major");
const chordLabel = (root, q) => fmt(root) + SUF[q];
const triadOf = (root, q) => buildChord(root, TRIAD[q]);
const allPlain = (ns) => ns.every(plain);

// Triad on 1-based degree n of the key with signature k.
function degreeChord(k, n) {
  const sc = scaleOf(k);
  const q = QUAL_OF_DEGREE[n - 1];
  return { root: sc[n - 1], q, notes: triadOf(sc[n - 1], q) };
}
function noteCands(n) {
  return [note(n.l, n.a + 1), note(n.l, n.a - 1), note(n.l + 1, n.a), note(n.l - 1, n.a), note(n.l + 2, n.a), note(n.l - 2, n.a), note(n.l + 1, 0), note(n.l - 1, 0)]
    .filter((c) => plain(c) && !sameNote(c, n)).map(fmt);
}
function noteChoice(rng, id, label, ask, ans, hint) {
  const choices = fourChoices(rng, fmt(ans), noteCands(ans));
  return choices ? choicePart(id, label, ask, fmt(ans), choices, hint) : null;
}
function chordNotesChoice(rng, id, label, ask, root, q, hint) {
  const ans = fmtList(triadOf(root, q));
  const cands = [];
  for (const q2 of ["major", "minor", "diminished", "augmented"]) {
    if (q2 === q) continue;
    const c = triadOf(root, q2);
    if (allPlain(c)) cands.push(fmtList(c));
  }
  const base = triadOf(root, q);
  for (const i of [1, 2]) for (const d of [1, -1]) {
    const c = base.map((x, j) => (j === i ? note(x.l, x.a + d) : x));
    if (allPlain(c)) cands.push(fmtList(c));
  }
  const up = triadOf(note(root.l + 1, root.a), q);
  if (allPlain(up)) cands.push(fmtList(up));
  const choices = fourChoices(rng, ans, cands.filter((c) => c !== ans));
  return choices ? choicePart(id, label, ask, ans, choices, hint) : null;
}
function dom7Choice(rng, id, label, ask, root, hint) {
  const ans = fmtList(buildChord(root, SEVENTH.dom7));
  const cands = [];
  for (const r of [SEVENTH.maj7, SEVENTH.min7, TRIAD.major]) {
    const c = buildChord(root, r);
    if (allPlain(c)) cands.push(fmtList(c));
  }
  const base = buildChord(root, SEVENTH.dom7);
  for (const i of [1, 2, 3]) for (const d of [1, -1]) {
    const c = base.map((x, j) => (j === i ? note(x.l, x.a + d) : x));
    if (allPlain(c)) cands.push(fmtList(c));
  }
  const choices = fourChoices(rng, ans, cands.filter((c) => c !== ans));
  return choices ? choicePart(id, label, ask, ans, choices, hint) : null;
}
const chordSeg = (rng, id, label, ask, k, n, hint) => {
  const sc = scaleOf(k);
  const ch = degreeChord(k, n);
  const roots = [...new Set([fmt(ch.root), ...sc.map(fmt)])];
  return segPart(rng, { id, label, ask, cols: ["Root", "Quality"], answer: [fmt(ch.root), ch.q], opts: [roots.slice(0, 4), QUALITIES], hint, n: 5 });
};
// A chord that is (or is not) in the key: the triad on degree m, or the same root with the other of major/minor.
function probeChord(k, m, flip) {
  const ch = degreeChord(k, m);
  if (!flip) return { root: ch.root, q: ch.q, dia: true };
  const q = ch.q === "major" ? "minor" : "major";
  return { root: ch.root, q, dia: false };
}
const inScale = (sc, ns) => ns.every((x) => sc.some((s) => sameNote(s, x)));

// ---------- key-chords ----------

function genKeyChords(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const ctx = rng.pick(CONTEXT);
    const k = rng.int(-5, 5);
    const n = rng.int(2, 6);
    const m = rng.int(2, 6);
    const flip = rng.next() < 0.5;
    const t = majorTonic(k);
    const sc = scaleOf(k);
    const ch = degreeChord(k, n);
    if (!plain(t) || !allPlain(sc) || !allPlain(ch.notes)) continue;
    const kn = keyName(t);
    const scTxt = fmtList(sc);
    const degTxt = `${ordinal(n)} note of the scale`;
    const hQual = "Triad qualities follow a fixed pattern over degrees 1 to 7 (the same in every key of this type); recall it, or test the third and fifth above the root against the scale.";
    const hScale = "Write out the major scale (whole, whole, half, whole, whole, whole, half steps) and count up to the degree.";
    if (tier === "medium") {
      const root = noteChoice(rng, "root", "Chord root", `Root of the triad built on the ${degTxt}`, ch.root, hScale);
      if (!root) continue;
      const parts = [root, choicePart("quality", "Quality", "Quality of that triad", ch.q, QUALITIES.slice(), hQual)];
      return finish(
        `${ctx[0].toUpperCase() + ctx.slice(1)} is in **${kn}**. A triad is built on the **${degTxt}** (degree ${n}), using only notes of the key.`,
        parts,
        `**Scale:** ${kn} is ${scTxt}.\n\n**Root:** degree ${n} is **${fmt(ch.root)}**.\n\n**Quality:** stacking thirds on ${fmt(ch.root)} within the key gives ${fmtList(ch.notes)}, a **${ch.q}** triad.`,
        "mk-deg", { t, n }, [["_degree", n]],
        ["Find the scale first, then read off the note in position " + n + ".", "Use the fixed quality pattern for triads on each degree of a major key."],
      );
    }
    if (tier === "hard") {
      if (k === 0) continue;
      const notes = chordNotesChoice(rng, "notes", "Spelling", "The notes of that triad", ch.root, ch.q, "Stack a third and a fifth above the root using notes of the key (every other scale note).");
      if (!notes) continue;
      const parts = [
        intPart("sig", "Key signature", "How many sharps or flats does the key signature have?", Math.abs(k), "Count the accidentals in the scale you wrote out (the key signature holds each one once)."),
        chordSeg(rng, "chord", "Chord", `Triad on the ${degTxt}`, k, n, hScale + " Then use the major/minor pattern for triads."),
        notes,
      ];
      return finish(
        `${ctx[0].toUpperCase() + ctx.slice(1)} is in **${kn}**. Work out the key signature, then the triad built on the **${degTxt}** (degree ${n}), using only notes of the key.`,
        parts,
        `**Signature:** ${scTxt} has ${Math.abs(k)} ${k > 0 ? "sharp" : "flat"}${Math.abs(k) === 1 ? "" : "s"}, so the key signature has **${Math.abs(k)}**.\n\n**Chord:** degree ${n} is ${fmt(ch.root)}, and the triad is **${fmt(ch.root)} | ${ch.q}**.\n\n**Spelling:** root, third and fifth from the key: **${fmtList(ch.notes)}**.`,
        "mk-hard", { t, n }, [["_degree", n]],
        ["Write the scale out; the signature is the number of sharps or flats in it.", "Take every other note of the scale from the chosen degree."],
      );
    }
    if (tier === "expert") {
      if (k === 0) continue;
      const pr = probeChord(k, m, flip);
      const prNotes = triadOf(pr.root, pr.q);
      if (!allPlain(prNotes)) continue;
      const relmin = fourChoices(rng, `${fmt(minorTonic(k))} minor`, noteCands(minorTonic(k)).map((s) => `${s} minor`));
      const tonic = noteChoice(rng, "tonic", "Tonic", "The major key", t, "The last sharp is the 7th note of the key (one semitone below the tonic); the last flat is the 4th note (it names the key one step below).");
      if (!relmin || !tonic || !plain(minorTonic(k))) continue;
      tonic.ask = "Tonic of the major key";
      const parts = [
        tonic,
        choicePart("relmin", "Relative minor", "The relative minor key (same signature)", `${fmt(minorTonic(k))} minor`, relmin, "The relative minor starts on the 6th note of the major scale (a minor 3rd below the tonic)."),
        chordSeg(rng, "chord", "Chord", `Triad on degree ${n} of the major key`, k, n, "Find the scale, count to the degree and use the major, minor, minor, major, major, minor, diminished pattern."),
        yesNo("dia", "Diatonic?", `Is the triad ${chordLabel(pr.root, pr.q)} (${fmtList(prNotes)}) made only of notes of the key?`, pr.dia, "Compare each note of the triad with the scale you wrote out."),
      ];
      return finish(
        `A score has a key signature of **${sigPhrase(k)}** and the piece is in a **major** key (${ctx}). Find the key, its relative minor and the triad on degree **${n}**, then test a chord.`,
        parts,
        `**Tonic:** ${sigPhrase(k)} in major is **${kn}**, with scale ${scTxt}.\n\n**Relative minor:** the 6th note, **${fmt(minorTonic(k))} minor**.\n\n**Chord:** degree ${n} is **${fmt(ch.root)} | ${ch.q}**.\n\n**Test:** ${chordLabel(pr.root, pr.q)} is ${fmtList(prNotes)}; ${pr.dia ? "all of these are in the scale, so **Yes**" : "not all of these are in the scale, so **No**"}.`,
        "mk-exp", { sig: k, n, probe: { root: pr.root, q: pr.q } }, [["_accidentals", Math.abs(k)], ["_degree", n]],
        ["Use the signature to find the key, then everything else comes from its scale.", "Write the scale and mark every note of the test chord against it."],
      );
    }
    // expert-plus: work backwards from a chord and its degree.
    const pr = probeChord(k, m === n ? (m === 6 ? 2 : m + 1) : m, flip);
    const prNotes = triadOf(pr.root, pr.q);
    const d5 = buildChord(sc[4], SEVENTH.dom7);
    if (!allPlain(prNotes) || !allPlain(d5) || k === 0) continue;
    const tonic = noteChoice(rng, "tonic", "Tonic", "The major key the chord belongs to", t, "The degree tells you how far above the tonic the chord root is; go back down that interval.");
    const v7 = dom7Choice(rng, "v7", "Dominant 7th", "The dominant seventh chord (V7) of that key", sc[4], "V7 is built on the 5th note of the scale: root, 3rd, 5th and a minor 7th, all from the key.");
    if (!tonic || !v7) continue;
    const parts = [
      tonic,
      intPart("sig", "Key signature", "How many sharps or flats does that key have?", Math.abs(k), "Write out the scale from the tonic you found and count the accidentals."),
      v7,
      yesNo("dia", "Diatonic?", `Is the triad ${chordLabel(pr.root, pr.q)} (${fmtList(prNotes)}) made only of notes of that key?`, pr.dia, "Compare each note of the triad with the key's scale."),
    ];
    return finish(
      `In ${ctx}, the **${chordLabel(ch.root, ch.q)}** chord is the triad on degree **${n}** of a major key. Work backwards to the key, then answer about it.`,
      parts,
      `**Key:** degree ${n} is a ${["", "major 2nd", "major 3rd", "perfect 4th", "perfect 5th", "major 6th"][n - 1]} above the tonic, so the tonic is **${fmt(t)}** (${scTxt}).\n\n**Signature:** **${Math.abs(k)}** ${k > 0 ? "sharp" : "flat"}${Math.abs(k) === 1 ? "" : "s"}.\n\n**V7:** on ${fmt(sc[4])}: **${fmtList(d5)}**.\n\n**Test:** ${chordLabel(pr.root, pr.q)} is ${fmtList(prNotes)}; ${pr.dia ? "all in the scale, **Yes**" : "not all in the scale, **No**"}.`,
      "mk-back", { root: ch.root, q: ch.q, n, probe: { root: pr.root, q: pr.q } }, [["_degree", n]],
      ["Subtract the degree's interval from the chord root to find the tonic.", "Then write the whole scale and test each note."],
    );
  }
  return tooMany();
}

// ---------- progression ----------

const PROGS = [[1, 4, 5, 1], [1, 6, 4, 5], [1, 2, 5, 1], [1, 4, 1, 5], [1, 5, 4, 1], [1, 4, 5, 6], [6, 4, 1, 5], [1, 6, 2, 5], [1, 3, 4, 1], [2, 5, 1, 4], [1, 5, 6, 4], [4, 5, 3, 6]];
const CADENCES = ["Authentic", "Plagal", "Half", "Deceptive", "None of these"];
const CAD_RULE = "Cadence rule (last two chords): ending on V is a **half** cadence; V then I is **authentic**; IV then I is **plagal**; V then vi is **deceptive**; anything else is **none of these**.";
function cadenceBuild(p) {
  const [a, b] = p.slice(-2);
  if (b === 5) return "Half";
  if (a === 5 && b === 1) return "Authentic";
  if (a === 4 && b === 1) return "Plagal";
  if (a === 5 && b === 6) return "Deceptive";
  return "None of these";
}
const progNames = (k, degs) => degs.map((d) => { const c = degreeChord(k, d); return chordLabel(c.root, c.q); });
const progRomans = (degs) => degs.map((d) => romanOf(d, QUAL_OF_DEGREE[d - 1]));
const ROMAN_OPTS = [1, 2, 3, 4, 5, 6].map((d) => romanOf(d, QUAL_OF_DEGREE[d - 1]));
const cadencePart = (degs) => choicePart("cad", "Cadence", "Cadence at the end", cadenceBuild(degs), CADENCES.slice(), "Look only at the last two chords and apply the rule in the question.");
function namesChoice(rng, k, degs) {
  const ans = progNames(k, degs).join(DASH);
  const cands = [];
  for (let pos = 0; pos < degs.length; pos++) for (let d = 1; d <= 6; d++) {
    if (d === degs[pos]) continue;
    const alt = degs.slice(); alt[pos] = d;
    const s = progNames(k, alt).join(DASH);
    if (s !== ans) cands.push(s);
  }
  return fourChoices(rng, ans, cands);
}
const romanSeg = (rng, degs, hint) => segPart(rng, { id: "rn", label: "Roman numerals", ask: "The chords as Roman numerals", cols: ["1st", "2nd", "3rd", "4th"], answer: progRomans(degs), opts: [0, 1, 2, 3].map(() => ROMAN_OPTS), hint, n: 5 });

function genProg(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const ctx = rng.pick(CONTEXT);
    const k = rng.int(-5, 5);
    const degs = rng.pick(PROGS);
    const pos = rng.int(0, 3);
    const t = majorTonic(k);
    const sc = scaleOf(k);
    if (!plain(t) || !allPlain(sc)) continue;
    const names = progNames(k, degs);
    const rn = progRomans(degs);
    const kn = keyName(t);
    const cad = cadenceBuild(degs);
    const lastCh = degreeChord(k, degs[3]);
    if (tier === "medium") {
      const nm = namesChoice(rng, k, degs);
      if (!nm) continue;
      const parts = [choicePart("names", "Chords", "The progression written as chord names", names.join(DASH), nm, "Find the scale of the key; each numeral is a degree, and upper case means major, lower case means minor."), cadencePart(degs)];
      return finish(
        `${ctx[0].toUpperCase() + ctx.slice(1)} in **${kn}** uses the progression **${rn.join(DASH)}** (upper case = major triad, lower case = minor triad). ${CAD_RULE}`,
        parts,
        `**Scale:** ${fmtList(sc)}.\n\n**Chords:** ${rn.map((r, j) => `${r} = ${names[j]}`).join(", ")}, so **${names.join(DASH)}**.\n\n**Cadence:** the last two chords are ${rn[2]} then ${rn[3]}, which is **${cad}**.`,
        "pg-med", { t, degs }, [],
        ["Roman numerals count scale degrees: I is the tonic, V the fifth note.", "Check the last two numerals against the cadence rule."],
      );
    }
    if (tier === "hard") {
      const span = keyboardDistance(sc[degs[0] - 1], sc[degs[3] - 1]);
      const parts = [
        romanSeg(rng, degs, "Find each chord's root in the scale of the key; a minor chord gets a lower-case numeral."),
        cadencePart(degs),
        intPart("span", "Root distance", "Semitones from the first chord's root up to the last chord's root (0 to 11)", span, "Count keys on a keyboard from the first root up to the last root (0 if they are the same note)."),
      ];
      return finish(
        `${ctx[0].toUpperCase() + ctx.slice(1)} in **${kn}** has the four chords **${names.join(DASH)}** (an m after a name means minor). Name them with Roman numerals (upper case = major, lower case = minor). ${CAD_RULE}`,
        parts,
        `**Scale:** ${fmtList(sc)}.\n\n**Numerals:** ${names.map((n, j) => `${n} = ${rn[j]}`).join(", ")}.\n\n**Cadence:** ${rn[2]} then ${rn[3]} is **${cad}**.\n\n**Distance:** ${fmt(sc[degs[0] - 1])} up to ${fmt(sc[degs[3] - 1])} is **${span}** semitone${span === 1 ? "" : "s"}.`,
        "pg-hard", { t, names, degs: undefined }, [],
        ["Match each chord root to a note of the scale to get its degree.", "Count semitones on a keyboard (one per key, black keys included)."],
      );
    }
    if (tier === "expert") {
      if (k === 0) continue;
      const tonic = noteChoice(rng, "tonic", "Tonic", "The major key", t, "A key signature with sharps: the tonic is a semitone above the last sharp; with flats: the tonic is the flat before the last one (one flat means F).");
      const lastNotes = chordNotesChoice(rng, "last", "Last chord", "The notes of the last chord", lastCh.root, lastCh.q, "Stack thirds on the root using only notes of the key.");
      if (!tonic || !lastNotes) continue;
      tonic.ask = "Tonic of the major key";
      const parts = [tonic, romanSeg(rng, degs, "Find each chord root in the scale; lower-case numerals are minor chords."), cadencePart(degs), lastNotes];
      return finish(
        `${ctx[0].toUpperCase() + ctx.slice(1)} has a key signature of **${sigPhrase(k)}** (major key) and the chords **${names.join(DASH)}** (m = minor). ${CAD_RULE}`,
        parts,
        `**Key:** ${sigPhrase(k)} in major is **${kn}**, scale ${fmtList(sc)}.\n\n**Numerals:** ${names.map((n, j) => `${n} = ${rn[j]}`).join(", ")}.\n\n**Cadence:** ${rn[2]} then ${rn[3]} is **${cad}**.\n\n**Last chord:** ${names[3]} is **${fmtList(lastCh.notes)}**.`,
        "pg-exp", { sig: k, names }, [["_accidentals", Math.abs(k)]],
        ["Identify the key from the signature first.", "The last chord's name tells you its root and quality; spell it from the scale."],
      );
    }
    // expert-plus: key from one named chord and the numerals.
    if (k === 0) continue;
    const tonic = noteChoice(rng, "tonic", "Tonic", "The major key", t, "Go down from the named chord by its degree's interval to reach the tonic.");
    const nm = namesChoice(rng, k, degs);
    if (!tonic || !nm) continue;
    tonic.ask = "Tonic of the major key";
    const parts = [
      tonic,
      choicePart("names", "Chords", "The whole progression as chord names", names.join(DASH), nm, "With the key known, turn each numeral into a scale degree and name the chord."),
      cadencePart(degs),
      intPart("sig", "Key signature", "How many sharps or flats does the key have?", Math.abs(k), "Write out the major scale and count the accidentals."),
    ];
    return finish(
      `${ctx[0].toUpperCase() + ctx.slice(1)} uses the progression **${rn.join(DASH)}** in a major key (upper case = major, lower case = minor). Its **${ordinal(pos + 1)}** chord is **${names[pos]}**. ${CAD_RULE}`,
      parts,
      `**Key:** the ${ordinal(pos + 1)} chord is ${rn[pos]} (degree ${degs[pos]}) and equals ${names[pos]}, so the tonic is **${fmt(t)}** (${fmtList(sc)}).\n\n**Chords:** **${names.join(DASH)}**.\n\n**Cadence:** ${rn[2]} then ${rn[3]} is **${cad}**.\n\n**Signature:** **${Math.abs(k)}** ${k > 0 ? "sharp" : "flat"}${Math.abs(k) === 1 ? "" : "s"}.`,
      "pg-back", { rn, pos, known: names[pos] }, [["_position", pos + 1]],
      ["The numeral at that position gives the degree; the chord name gives the note on that degree.", "Once the tonic is known, every other chord follows from the scale."],
    );
  }
  return tooMany();
}

// ---------- bar-timing ----------

const BPMS = [60, 72, 80, 90, 96, 100, 108, 112, 120, 132, 144, 150];
const MARKINGS = [["Largo", 40, 59], ["Adagio", 60, 75], ["Andante", 76, 107], ["Moderato", 108, 119], ["Allegro", 120, 167], ["Presto", 168, 200]];
const MARK_TXT = MARKINGS.map(([n, a, b]) => `${n} ${a}–${b}`).join(", ");
const mmss = (s) => `${Math.floor(s / 60)} min ${s % 60} s`;
const tempoTxt = (bpm) => `♩ = ${bpm}`;
const base = "A quarter note is one beat and the tempo counts quarter notes per minute.";

function genBars(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const ctx = rng.pick(["a march", "a dance tune", "a jingle", "a theme tune", "a lullaby", "a fanfare", "a school song", "a ballad"]);
    const N = rng.pick(tier === "medium" ? [2, 3, 4] : [2, 3, 4, 5]);
    const b1 = rng.pick(BPMS);
    const b2 = rng.pick(BPMS);
    const hBar = "A bar of N/4 has N beats, and one beat lasts 60 ÷ tempo seconds.";
    if (tier === "medium") {
      const T = rng.int(40, 180);
      const st = (rd) => ({ Bt: rd("Bt", (N * 60) / b1) });
      if (!stableOk(st, { Bt: 2 })) continue;
      const Bt = (N * 60) / b1;
      const q = T / Bt;
      if (Math.abs(q - Math.round(q)) < 0.08) continue;
      const bars = Math.floor(q);
      if (Math.floor(T / roundTo(Bt, 2)) !== bars) continue;
      const parts = [
        numPart("bt", "Bar length", "How long is one bar (seconds)", Bt, 2, hBar),
        intPart("bars", "Complete bars", `How many complete bars fit in ${T} seconds (round down)?`, bars, "Divide the time by the length of one bar and keep the whole number."),
      ];
      return finish(
        `${ctx[0].toUpperCase() + ctx.slice(1)} is written in **${N}/4** at **${tempoTxt(b1)}**. ${base}`,
        parts,
        `**Bar length:** ${N} beats × 60 ÷ ${b1} = **${fixed(Bt, 2)} s**.\n\n**Bars:** ${T} ÷ ${fixed(Bt, 2)} = ${fmtN(q, 2)}, so **${bars}** complete bars.`,
        "bt-med", { N, bpm: b1, T }, [["_beats", N], ["_tempo", b1], ["_seconds", T]],
        [hBar, "Divide the available seconds by the bar length and drop the fraction."],
      );
    }
    if (tier === "hard") {
      const M = rng.int(8, 48);
      const st = (rd) => { const Bt = rd("Bt", (N * 60) / b1); return { Bt, total: rd("total", M * Bt) }; };
      if (!stableOk(st, { Bt: 2, total: 1 })) continue;
      const r = st((k, v) => v);
      const S = Math.round(r.total * (rng.next() < 0.5 ? 0.9 : 1.1));
      if (Math.abs(r.total - S) < 3 || nearHalf(r.total, 0, 0.1)) continue;
      const fits = r.total <= S;
      const parts = [
        numPart("bt", "Bar length", "How long is one bar (seconds)", r.Bt, 2, hBar),
        numPart("total", "Piece length", `Length of the whole ${M}-bar piece (seconds)`, r.total, 1, "Multiply the bar length by the number of bars."),
        yesNo("fits", "Fits?", `The slot allows ${S} seconds. Does the piece fit?`, fits, "Compare the piece length with the slot."),
      ];
      return finish(
        `${ctx[0].toUpperCase() + ctx.slice(1)} runs for **${M} bars** in **${N}/4** at **${tempoTxt(b1)}**, and has to fit a broadcast slot of **${S} seconds**. ${base}`,
        parts,
        `**Bar:** ${N} × 60 ÷ ${b1} = **${fixed(r.Bt, 2)} s**.\n\n**Piece:** ${M} × ${fixed(r.Bt, 2)} = **${fixed(r.total, 1)} s**.\n\n**Fit:** ${fixed(r.total, 1)} s is ${fits ? "within" : "longer than"} ${S} s, so **${fits ? "Yes" : "No"}**.`,
        "bt-hard", { N, bpm: b1, M, S }, [["_beats", N], ["_tempo", b1], ["_bars", M], ["_slot", S]],
        [hBar, "Total time = bars × bar length; then compare."],
      );
    }
    if (tier === "expert") {
      if (b1 === b2) continue;
      const M1 = rng.int(8, 32);
      const M2 = rng.int(4, 24);
      const st = (rd) => { const dA = rd("dA", (M1 * N * 60) / b1); const dB = rd("dB", (M2 * N * 60) / b2); return { dA, dB, total: rd("total", dA + dB) }; };
      if (!stableOk(st, { dA: 1, dB: 1, total: 1 })) continue;
      const r = st((k, v) => v);
      const S = Math.round(r.total * (rng.next() < 0.5 ? 0.92 : 1.08));
      if (Math.abs(r.total - S) < 3) continue;
      const fits = r.total <= S;
      const parts = [
        numPart("da", "Section A", `Length of section A (seconds)`, r.dA, 1, "Section A: bars × beats per bar × 60 ÷ its tempo."),
        numPart("db", "Section B", `Length of section B (seconds)`, r.dB, 1, "Same method with the new tempo."),
        numPart("total", "Whole piece", "Total length (seconds)", r.total, 1, "Add the two sections."),
        yesNo("fits", "Fits?", `The recording slot is ${S} seconds. Does the piece fit?`, fits, "Compare the total with the slot."),
      ];
      return finish(
        `A piece in **${N}/4** has **${M1} bars** at **${tempoTxt(b1)}**, then ${b2 < b1 ? "slows down" : b2 > b1 ? "speeds up" : "continues"} for the last **${M2} bars** at **${tempoTxt(b2)}**. It must fit a slot of **${S} seconds**. ${base}`,
        parts,
        `**A:** ${M1} × ${N} × 60 ÷ ${b1} = **${fixed(r.dA, 1)} s**.\n\n**B:** ${M2} × ${N} × 60 ÷ ${b2} = **${fixed(r.dB, 1)} s**.\n\n**Total:** **${fixed(r.total, 1)} s**, which is ${fits ? "within" : "over"} ${S} s, so **${fits ? "Yes" : "No"}**.`,
        "bt-exp", { N, b1, M1, b2, M2, S }, [["_beats", N], ["_bars_a", M1], ["_tempo_a", b1], ["_bars_b", M2], ["_tempo_b", b2], ["_slot", S]],
        ["Each section has its own tempo: beats in the section × 60 ÷ tempo.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
      );
    }
    // expert-plus: work backwards from the target length to the tempo.
    const M = rng.int(24, 96);
    if ((M * N * 60) % b1 !== 0) continue;
    const T = (M * N * 60) / b1;
    if (T < 60 || T > 360) continue;
    const mk = MARKINGS.find(([, a, b]) => b1 >= a && b1 <= b);
    if (!mk) continue;
    const st = (rd) => ({ Bt: rd("Bt", (N * 60) / b1), sx: rd("sx", (b1 * 4) / 60) });
    if (!stableOk(st, { Bt: 2, sx: 2 })) continue;
    const r = st((k, v) => v);
    const parts = [
      intPart("bpm", "Tempo", "Tempo needed (quarter notes per minute)", b1, "Total beats = bars × beats per bar. Tempo = beats ÷ minutes."),
      choicePart("mark", "Marking", "Which tempo marking does that tempo fall in?", mk[0], MARKINGS.map((m) => m[0]), "Compare your tempo with the ranges given in the question."),
      numPart("bt", "Bar length", "How long is one bar (seconds)", r.Bt, 2, "Beats per bar × 60 ÷ tempo."),
      numPart("sx", "Sixteenths", "Sixteenth notes played per second (a quarter note holds 4 sixteenths)", r.sx, 2, "Quarter notes per second is tempo ÷ 60; multiply by 4."),
    ];
    return finish(
      `${ctx[0].toUpperCase() + ctx.slice(1)} of **${M} bars** in **${N}/4** has to last exactly **${mmss(T)}**. ${base} Tempo markings (quarter notes per minute): ${MARK_TXT}.`,
      parts,
      `**Tempo:** ${M} × ${N} = ${M * N} beats in ${T} s, so ${M * N} × 60 ÷ ${T} = **${b1}** per minute.\n\n**Marking:** ${b1} is in the **${mk[0]}** range.\n\n**Bar:** ${N} × 60 ÷ ${b1} = **${fixed(r.Bt, 2)} s**.\n\n**Sixteenths:** ${b1} ÷ 60 × 4 = **${fixed(r.sx, 2)}** per second.`,
      "bt-plus", { N, M, T }, [["_bars", M], ["_beats", N], ["_seconds", T]],
      ["Count all the beats in the piece, then convert to beats per minute.", "Round each answer as asked; using a rounded earlier answer gives the same later answer."],
    );
  }
  return tooMany();
}

// ---------- transposition ----------

const UPS = [[2, "major"], [3, "minor"], [3, "major"], [4, "perfect"], [5, "perfect"], [6, "major"], [6, "minor"], [7, "minor"]];
const INSTR = [
  { name: "B♭ trumpet", num: 2, q: "major", word: "a major 2nd" },
  { name: "A clarinet", num: 3, q: "minor", word: "a minor 3rd" },
  { name: "E♭ alto saxophone", num: 6, q: "major", word: "a major 6th" },
  { name: "F horn", num: 5, q: "perfect", word: "a perfect 5th" },
];
// The note a given interval below `root` (spelled correctly), found by letter and semitone.
function noteBelow(root, num, quality) {
  const l = (((root.l - (num - 1)) % 7) + 7) % 7;
  const target = (((pc(root) - intervalSize(num, quality)) % 12) + 12) % 12;
  for (const a of [0, 1, -1, 2, -2]) if (pc(note(l, a)) === target) return note(l, a);
  return null;
}
const ivWord = (num, q) => `a ${q} ${["", "unison", "2nd", "3rd", "4th", "5th", "6th", "7th"][num]}`;
const sigSeg = (rng, k, kinds, hint, lbl = "New signature", ask = "Key signature of the new key") => {
  const ans = [String(Math.abs(k)), kindOfK(k)];
  return segPart(rng, { id: "sig", label: lbl, ask, cols: ["Accidentals", "Kind"], answer: ans, opts: [["0", "1", "2", "3", "4", "5", "6", "7"], kinds], hint, n: 5 });
};
function ivChoice(rng, num, q, hint) {
  const ans = intervalName(num, q);
  const cands = [];
  for (let nn = 2; nn <= 7; nn++) for (const qq of nn === 4 || nn === 5 ? ["perfect"] : ["major", "minor"]) if (intervalName(nn, qq) !== ans) cands.push(intervalName(nn, qq));
  const ch = fourChoices(rng, ans, cands);
  return ch ? choicePart("interval", "Interval", "The interval moved up (smaller than an octave)", ans, ch, hint) : null;
}

function genTranspose(rng, tier) {
  for (let i = 0; i < TRY; i++) {
    const ctx = rng.pick(CONTEXT);
    const [num, q] = rng.pick(UPS);
    const x = note(rng.int(0, 6), rng.int(-1, 1));
    const k = rng.int(-4, 4);
    const k2 = rng.int(-5, 5);
    const inst = rng.pick(INSTR);
    const d = rng.pick([2, 3, 5, 6]);
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    if (tier === "medium") {
      const r = noteAbove(x, num, q);
      if (!plain(r)) continue;
      const res = noteChoice(rng, "result", "Moved note", "The note after transposing", r, "Count letter names up by the interval's number, then fix the accidental to get the right size.");
      if (!res) continue;
      const parts = [res, intPart("semi", "Semitones", "How many semitones is that interval?", intervalSize(num, q), "Major 3rd = 4, minor 3rd = 3, perfect 4th = 5, perfect 5th = 7, major 2nd = 2; add or take away one for each step of quality.")];
      return finish(
        `${cap(ctx)} has a melody note **${fmt(x)}** that must be moved **up ${ivWord(num, q)}**.`,
        parts,
        `**Letter:** ${num} letter names up from ${fmt(x)} is ${fmt(note(x.l + num - 1, 0))[0]}.\n\n**Accidental:** ${ivWord(num, q)} is ${intervalSize(num, q)} semitones, so the note is **${fmt(r)}**.\n\n**Size:** **${intervalSize(num, q)}** semitones.`,
        "tr-med", { x, num, q }, [["_number", num]],
        ["The letter name is found by counting; the accidental by counting semitones.", "A perfect 5th is 7 semitones; the others are in the hint of the number part."],
      );
    }
    if (tier === "hard") {
      if (k === 0) continue;
      const t = majorTonic(k);
      const nt = noteAbove(t, num, q);
      const nk = keyIndex(nt, "major");
      if (!plain(t) || !plain(nt) || nk === null || nk === 0 || Math.abs(nk) > 5) continue;
      const mel = scaleOf(k)[d - 1];
      const moved = noteAbove(mel, num, q);
      if (!plain(mel) || !plain(moved)) continue;
      const tonic = noteChoice(rng, "tonic", "New tonic", "The new tonic", nt, "Move the tonic up by the interval, as in a single note.");
      const mv = noteChoice(rng, "moved", "Melody note", `Where the melody note ${fmt(mel)} ends up`, moved, "Move the note up by the same interval.");
      if (!tonic || !mv) continue;
      const parts = [tonic, sigSeg(rng, nk, ["sharps", "flats"], "Write out the new major scale and count its accidentals."), mv];
      return finish(
        `${cap(ctx)} is in **${keyName(t)}**. The whole piece is moved **up ${ivWord(num, q)}**, including the melody note **${fmt(mel)}**.`,
        parts,
        `**Tonic:** ${fmt(t)} up ${ivWord(num, q)} is **${fmt(nt)}**.\n\n**Signature:** ${keyName(nt)} has ${sigPhrase(nk)}: **${Math.abs(nk)} | ${kindOfK(nk)}**.\n\n**Melody:** ${fmt(mel)} up the same interval is **${fmt(moved)}**.`,
        "tr-hard", { t, num, q, d }, [["_number", num]],
        ["Transpose the tonic like any other note.", "Once you know the new key, write its scale to count the accidentals."],
      );
    }
    if (tier === "expert") {
      if (k === 0) continue;
      const t = majorTonic(k);
      const ct = noteBelow(t, inst.num, inst.q);
      const ck = ct ? keyIndex(ct, "major") : null;
      if (!plain(t) || !ct || !plain(ct) || ck === null || Math.abs(ck) > 6) continue;
      const mel = scaleOf(k)[d - 1];
      const snd = noteBelow(mel, inst.num, inst.q);
      if (!snd || !plain(snd)) continue;
      const tonic = noteChoice(rng, "tonic", "Concert tonic", "The tonic that sounds (concert key)", ct, "The part sounds lower than written, so go down by the interval from the written tonic.");
      const sn = noteChoice(rng, "sound", "Sounding note", `The sounding note for the written note ${fmt(mel)}`, snd, "Go down by the same interval from the written note.");
      if (!tonic || !sn) continue;
      const cmp = Math.abs(ck) < Math.abs(k) ? "Fewer" : Math.abs(ck) === Math.abs(k) ? "Same" : "More";
      const parts = [
        tonic,
        sigSeg(rng, ck, ["sharps", "flats", "none"], "Write out the concert major scale and count its accidentals.", "Concert signature", "Key signature of the concert key"),
        sn,
        choicePart("cmp", "Complexity", "Compared with the written key, the concert key has how many sharps or flats?", cmp, ["Fewer", "Same", "More"], "Compare the two counts."),
      ];
      return finish(
        `${cap(ctx)} has a part for **${inst.name}**, written in **${keyName(t)}**, which opens on the written note **${fmt(mel)}**. This instrument sounds **${inst.word} lower** than written. Find what actually sounds.`,
        parts,
        `**Concert tonic:** ${fmt(t)} down ${inst.word} is **${fmt(ct)}**.\n\n**Signature:** ${keyName(ct)} has ${sigPhrase(ck)}: **${Math.abs(ck)} | ${kindOfK(ck)}**.\n\n**Sounding note:** written ${fmt(mel)} sounds **${fmt(snd)}**.\n\n**Compare:** written ${Math.abs(k)}, concert ${Math.abs(ck)}: **${cmp}**.`,
        "tr-exp", { t, num: inst.num, q: inst.q, d }, [["_number", inst.num]],
        ["Going down an interval: count the letter names down, then fix the accidental.", "Use the scale of the concert key for the signature."],
      );
    }
    // expert-plus: work backwards from the old key and the new signature.
    if (k === 0 || k2 === 0 || k === k2) continue;
    const t = majorTonic(k);
    const nt = majorTonic(k2);
    const c = classify(t, nt);
    if (!plain(t) || !plain(nt) || !c || c.num < 2 || c.num > 7 || c.quality === "augmented" || c.quality === "diminished") continue;
    const mel = scaleOf(k)[d - 1];
    const moved = noteAbove(mel, c.num, c.quality);
    if (!plain(mel) || !plain(moved)) continue;
    const tonic = noteChoice(rng, "tonic", "New tonic", "The new tonic", nt, "Write the major scales: find the one with that signature.");
    const iv = ivChoice(rng, c.num, c.quality, "Count letter names from the old tonic to the new, then the semitones.");
    const mv = noteChoice(rng, "moved", "Melody note", `Where the melody note ${fmt(mel)} ends up`, moved, "Move the note up by the interval you found.");
    if (!tonic || !iv || !mv) continue;
    const semi = intervalSize(c.num, c.quality);
    const parts = [tonic, iv, intPart("semi", "Semitones", "How many semitones is that interval?", semi, "Count keys on a keyboard from the old tonic up to the new one."), mv];
    return finish(
      `${cap(ctx)} in **${keyName(t)}** is moved up to the major key with **${sigPhrase(k2)}** (the nearest such key above, less than an octave). Its melody includes the note **${fmt(mel)}**.`,
      parts,
      `**New key:** ${sigPhrase(k2)} in major is **${keyName(nt)}**.\n\n**Interval:** ${fmt(t)} up to ${fmt(nt)} is **${intervalName(c.num, c.quality)}**.\n\n**Semitones:** **${semi}**.\n\n**Melody:** ${fmt(mel)} up the same interval is **${fmt(moved)}**.`,
      "tr-plus", { t, nc: Math.abs(k2), nk: kindOfK(k2), d }, [["_accidentals", Math.abs(k2)]],
      ["First find the new tonic from the signature.", "The interval and its size come from the two tonics; then reuse it for the melody."],
    );
  }
  return tooMany();
}

// ---------- entry points ----------

export function generate(args) {
  const q = generateCore(args);
  // Audio preview (ticket 023): derived from the finished question, so no rng and nothing else changes.
  try { withPlay(q, playFor(q)); } catch { /* no preview */ }
  return q;
}

// What to play after the answer is checked: the chord or progression the scenario is about, or the
// interval a part is transposed by. Tempo and bar questions have nothing to hear (null).
function playFor(q) {
  const p = q.params || {};
  const major = (t) => scaleByPattern(t, "major");
  const triadOn = (s, n) => [s[n - 1], s[(n + 1) % 7], s[(n + 3) % 7]];
  // "B♭m – G♭ – D♭" -> chords. The chord names are the same text the question shows.
  const fromNames = (names) => {
    const chords = names.map((nm) => {
      const m = /^([A-G][♯♭]?)(m|dim)?$/.exec(nm);
      const root = m && parseNote(m[1]);
      return root ? buildChord(root, TRIAD[m[2] === "m" ? "minor" : m[2] === "dim" ? "diminished" : "major"]) : null;
    });
    return chords.every(Boolean) ? playProgression(chords) : null;
  };
  switch (p.kind) {
    case "mk-deg": case "mk-hard": return playChord(triadOn(major(p.t), p.n));
    case "mk-exp": {
      for (let l = 0; l < 7; l++) for (let a = -1; a <= 1; a++) {
        const t = note(l, a), s = major(t);
        if (s.filter((x) => x.a !== 0).length === Math.abs(p.sig) && s.some((x) => x.a * Math.sign(p.sig) > 0)) return playChord(triadOn(s, p.n));
      }
      return null;
    }
    case "mk-back": return playChord(buildChord(p.root, TRIAD[p.q]));
    case "pg-med": { const s = major(p.t); return playProgression(p.degs.map((d) => triadOn(s, d))); }
    case "pg-hard": case "pg-exp": return fromNames(p.names);
    case "pg-back": {
      const part = (q.parts || []).find((x) => x.id === "names");
      return part && typeof part.answer === "string" ? fromNames(part.answer.split(DASH)) : null;
    }
    case "tr-med": return playInterval(p.x, intervalSize(p.num, p.q));
    case "tr-hard": return playInterval(p.t, intervalSize(p.num, p.q)); // the piece moves up by this interval
    default: return null;
  }
}

function generateCore({ subtopic, difficulty, rng }) {
  if (!(difficulty in TIER_PARTS)) throw new Error(`Unsupported difficulty: ${difficulty}`);
  if (subtopic === "key-chords") return genKeyChords(rng, difficulty);
  if (subtopic === "progression") return genProg(rng, difficulty);
  if (subtopic === "bar-timing") return genBars(rng, difficulty);
  if (subtopic === "transposition") return genTranspose(rng, difficulty);
  throw new Error(`Unknown subtopic: ${subtopic}`);
}

// ---------- independent verification (CHECK toolkit: step patterns, keyboard walking, classify, identifyChord) ----------

const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v));
const partNum = (answer, id) => (answer && typeof answer === "object" ? num(answer[id]) : NaN);
const partStr = (answer, id) => {
  const v = answer && typeof answer === "object" ? answer[id] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v).trim();
};
const near = (cand, truth, tol) => Number.isFinite(cand) && Math.abs(cand - truth) <= tol + 1e-9;
const YN = (b) => (b ? "Yes" : "No");

const sc = (t) => scaleByPattern(t, "major");
const accCount = (s) => s.filter((x) => x.a !== 0).length;
const kindOf = (s) => (s.some((x) => x.a > 0) ? "sharps" : s.some((x) => x.a < 0) ? "flats" : "none");
const triadAt = (s, n) => identifyChord([s[n - 1], s[(n + 1) % 7], s[(n + 3) % 7]]);
const notesAt = (s, n) => [s[n - 1], s[(n + 1) % 7], s[(n + 3) % 7]];
const eachNote = (fn) => { for (let l = 0; l < 7; l++) for (let a = -2; a <= 2; a++) { const r = fn(note(l, a)); if (r) return note(l, a); } return null; };
const findTonic = (pred) => { for (let l = 0; l < 7; l++) for (let a = -1; a <= 1; a++) { const t = note(l, a); if (pred(t, sc(t))) return t; } return null; };
const bySig = (count, kind) => findTonic((t, s) => accCount(s) === count && kindOf(s) === kind);
const SIGLBL = (s) => `${accCount(s)} | ${kindOf(s)}`;
const parseP = (s) => parseNote(s);
const joinedNames = (s, degs) => degs.map((d) => { const id = triadAt(s, d); return fmt(id.root) + SUF[id.quality]; }).join(DASH);
const romanFromId = (s, id) => { const d = s.findIndex((x) => sameNote(x, id.root)); return id.quality === "major" ? ROMAN[d] : ROMAN[d].toLowerCase() + (id.quality === "diminished" ? "°" : ""); };
const cadRoman = (rn) => { const a = rn[rn.length - 2], b = rn[rn.length - 1]; if (b === "V") return "Half"; if (a === "V" && b === "I") return "Authentic"; if (a === "IV" && b === "I") return "Plagal"; if (a === "V" && b === "vi") return "Deceptive"; return "None of these"; };
const romanDeg = (r) => ROMAN.indexOf(r.replace("°", "").toUpperCase()) + 1;
const CUTS = [60, 76, 108, 120, 168];
const MARK_NAMES = ["Largo", "Adagio", "Andante", "Moderato", "Allegro", "Presto"];

const ALT = {
  "mk-deg": (p) => { const s = sc(p.t); const id = triadAt(s, p.n); return { root: fmt(id.root), quality: id.quality }; },
  "mk-hard": (p) => { const s = sc(p.t); const id = triadAt(s, p.n); return { sig: accCount(s), chord: `${fmt(id.root)} | ${id.quality}`, notes: fmtList(notesAt(s, p.n)) }; },
  "mk-exp": (p) => {
    const t = bySig(Math.abs(p.sig), p.sig > 0 ? "sharps" : "flats"); const s = sc(t); const id = triadAt(s, p.n);
    return { tonic: fmt(t), relmin: `${fmt(s[5])} minor`, chord: `${fmt(id.root)} | ${id.quality}`, dia: YN(inScale(s, triadOf(p.probe.root, p.probe.q))) };
  },
  "mk-back": (p) => {
    const t = findTonic((tt, s) => { const id = triadAt(s, p.n); return sameNote(id.root, p.root) && id.quality === p.q; });
    const s = sc(t);
    return { tonic: fmt(t), sig: accCount(s), v7: fmtList([s[4], s[6], s[1], s[3]]), dia: YN(inScale(s, triadOf(p.probe.root, p.probe.q))) };
  },
  "pg-med": (p) => { const s = sc(p.t); return { names: joinedNames(s, p.degs), cad: cadRoman(p.degs.map((d) => romanFromId(s, triadAt(s, d)))) }; },
  "pg-hard": (p) => {
    const s = sc(p.t);
    const rn = p.names.map((nm) => { for (let d = 1; d <= 7; d++) { const id = triadAt(s, d); if (fmt(id.root) + SUF[id.quality] === nm) return romanFromId(s, id); } return "?"; });
    const first = triadAt(s, romanDeg(rn[0])).root, last = triadAt(s, romanDeg(rn[3])).root;
    return { rn: rn.join(" | "), cad: cadRoman(rn), span: keyboardDistance(first, last) };
  },
  "pg-exp": (p) => {
    const t = bySig(Math.abs(p.sig), p.sig > 0 ? "sharps" : "flats"); const s = sc(t);
    const rn = p.names.map((nm) => { for (let d = 1; d <= 7; d++) { const id = triadAt(s, d); if (fmt(id.root) + SUF[id.quality] === nm) return romanFromId(s, id); } return "?"; });
    return { tonic: fmt(t), rn: rn.join(" | "), cad: cadRoman(rn), last: fmtList(notesAt(s, romanDeg(rn[3]))) };
  },
  "pg-back": (p) => {
    const degs = p.rn.map(romanDeg);
    const t = findTonic((tt, s) => { const id = triadAt(s, degs[p.pos]); return fmt(id.root) + SUF[id.quality] === p.known; });
    const s = sc(t);
    return { tonic: fmt(t), names: joinedNames(s, degs), cad: cadRoman(p.rn), sig: accCount(s) };
  },
  "bt-med": (p) => ({ bt: (p.N * 60) / p.bpm, bars: Math.floor((p.T * p.bpm) / (60 * p.N) + 1e-9) }),
  "bt-hard": (p) => { const tot = (p.M * p.N * 60) / p.bpm; return { bt: p.N / (p.bpm / 60), total: tot, fits: YN(tot <= p.S) }; },
  "bt-exp": (p) => {
    const dA = p.M1 * p.N * (60 / p.b1), dB = p.M2 * p.N * (60 / p.b2);
    return { da: dA, db: dB, total: dA + dB, fits: YN(dA + dB <= p.S) };
  },
  "bt-plus": (p) => {
    const bpm = (p.M * p.N * 60) / p.T;
    return { bpm, mark: MARK_NAMES[CUTS.filter((c) => c <= bpm).length], bt: p.N / (bpm / 60), sx: (bpm / 60) * 4 };
  },
  "tr-med": (p) => {
    const r = eachNote((c) => isInterval(p.x, c, p.num, p.q));
    return { result: (s) => { const n = parseP(s); return !!n && isInterval(p.x, n, p.num, p.q); }, semi: keyboardDistance(p.x, r) };
  },
  "tr-hard": (p) => {
    const nt = eachNote((c) => isInterval(p.t, c, p.num, p.q));
    const mel = sc(p.t)[p.d - 1];
    return {
      tonic: fmt(nt), sig: SIGLBL(sc(nt)),
      moved: (s) => { const n = parseP(s); return !!n && isInterval(mel, n, p.num, p.q); },
    };
  },
  "tr-exp": (p) => {
    const ct = eachNote((c) => isInterval(c, p.t, p.num, p.q));
    const mel = sc(p.t)[p.d - 1];
    const a = accCount(sc(p.t)), b = accCount(sc(ct));
    return {
      tonic: fmt(ct), sig: SIGLBL(sc(ct)),
      sound: (s) => { const n = parseP(s); return !!n && isInterval(n, mel, p.num, p.q); },
      cmp: b < a ? "Fewer" : b === a ? "Same" : "More",
    };
  },
  "tr-plus": (p) => {
    const nt = bySig(p.nc, p.nk);
    const c = classify(p.t, nt);
    const mel = sc(p.t)[p.d - 1];
    return {
      tonic: fmt(nt),
      interval: (s) => { const iv = parseInterval(s); return !!iv && isInterval(p.t, nt, iv.num, iv.quality); },
      semi: keyboardDistance(p.t, nt),
      moved: (s) => { const n = parseP(s); return !!n && isInterval(mel, n, c.num, c.quality); },
    };
  },
};

export function verify(question, answer) {
  const p = question && question.params;
  if (!p || !answer || typeof answer !== "object" || !p.dps) return false;
  const alt = ALT[p.kind];
  const parts = question.parts;
  if (!alt || !Array.isArray(parts) || parts.length < 2) return false;
  let truth;
  try { truth = alt(p); } catch { return false; }
  for (const part of parts) {
    const tv = truth[part.id];
    if (tv === undefined) return false;
    if (typeof tv === "number") {
      const dp = p.dps[part.id];
      if (!near(partNum(answer, part.id), tv, dp === undefined ? 0 : tolOf(dp))) return false;
    } else if (typeof tv === "function") {
      if (!tv(partStr(answer, part.id))) return false;
    } else if (partStr(answer, part.id) !== tv) return false;
  }
  return true;
}
