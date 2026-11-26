// Question visuals (ticket 026): the `visual` data a generator question may carry, validated.
// Pure module (no DOM; only js/lib/graph.js for ticks), so the engine, storage (import), the
// renderer (js/views/visual.js) and generators' verify() all share one set of rules.
//
//   sanitizeVisual(raw, warnKey) -> a cleaned copy, or undefined when absent or invalid.
//   visualAxes(v)  -> the axes the renderer draws for a cleaned bar / line / coords visual:
//                     { x?, y? } each { lo, hi, step, ticks } (ticks = gridline values).
//                     bar: y only; line and coords: x and y; other kinds: {}.
//                     Use it in verify() to check that a value read off the picture sits on a
//                     gridline (rule 4 of ticket 026).
//
// Data only, never markup: every string is plain text (escaped by the renderer). Any rule broken
// drops the whole visual, with one console.warn per warnKey (an object, e.g. the module's warn
// key, like sanitizeGiven). Unknown fields are ignored; the result is built from known fields only.
//
// Shared:  kind, caption? (≤ 80 chars)
// table:   columns [string ≤ 30] 1–6, rows [[string ≤ 30 | number | null]] 1–10 (each as long as
//          columns), align? ["left" | "right" | "center"] (one per column; default: right for a
//          column whose filled cells are all numbers, else left). null = blank cell, "?" = asked cell.
// bar:     categories [string ≤ 24] 1–10, series [{ name ≤ 30, values [number | null] }] 1–3
//          (one value per category; null = no bar), xLabel?, yLabel? (≤ 40), yMax?, yStep? (> 0),
//          showValues (default false).
// line:    series [{ name ≤ 30, points [[x, y]] 1–20 }] 1–3, xLabel?, yLabel?, xMin/xMax/yMin/yMax?,
//          xStep?/yStep? (> 0), showPoints, showValues (default false). Points must sit inside
//          any range given.
// triangle: vertices [{ label }] ×3, sides [{ label }] ×3 (side i is opposite vertex i),
//          angles [{ label, right? }] ×3 (at most one right angle); labels ≤ 12 chars, null or ""
//          = not shown. lengths? [a, b, c] (> 0, a strict triangle; a right angle must agree with
//          them within 0.5%). toScale (default false) needs lengths.
// shape:   shape (SHAPE_DIMS keys), dims? { name: number > 0 } (all of that shape's names when
//          given), labels? { name: string ≤ 16 | null } (SHAPE_LABELS keys), toScale (default
//          false) needs dims.
// coords:  xMin < xMax, yMin < yMax (required), points [{ x, y, label? ≤ 16 }] ≤ 8 (inside the
//          window), segments [[i, j]] ≤ 12 (point indices), lines [{ m, c } | { x }] ≤ 4,
//          showGrid (default true).

import { niceStep, ticks } from './graph.js';

export const VISUAL_KINDS = ['table', 'bar', 'line', 'triangle', 'shape', 'coords'];

export const CAPTION_MAX = 80;
export const TABLE_MAX_COLS = 6;
export const TABLE_MAX_ROWS = 10;
export const CELL_MAX = 30;
export const BAR_MAX_CATEGORIES = 10;
export const CATEGORY_MAX = 24;
export const SERIES_MAX = 3;
export const SERIES_NAME_MAX = 30;
export const AXIS_LABEL_MAX = 40;
export const LINE_MAX_POINTS = 20;
export const TRI_LABEL_MAX = 12;
export const SHAPE_LABEL_MAX = 16;
export const POINT_LABEL_MAX = 16;
export const COORDS_MAX_POINTS = 8;
export const COORDS_MAX_SEGMENTS = 12;
export const COORDS_MAX_LINES = 4;
const MAX_ABS = 1e9;
const MAX_TICKS = 25; // per axis, for a given step

// Dimension names per shape (the `dims` keys used for drawing).
export const SHAPE_DIMS = Object.freeze({
  rectangle: ['width', 'height'],
  circle: ['radius'],
  'composite-l': ['width', 'height', 'cutWidth', 'cutHeight'],
  cuboid: ['length', 'width', 'height'],
  cylinder: ['radius', 'height'],
  sector: ['radius', 'angle'],
});
// Label names per shape: the dims plus a few derived edges.
//   circle: diameter (drawn as a diameter instead of a radius when labelled)
//   composite-l: topWidth (width − cutWidth, the top edge), rightHeight (height − cutHeight)
//   sector: arc (the arc length)
export const SHAPE_LABELS = Object.freeze({
  rectangle: ['width', 'height'],
  circle: ['radius', 'diameter'],
  'composite-l': ['width', 'height', 'cutWidth', 'cutHeight', 'topWidth', 'rightHeight'],
  cuboid: ['length', 'width', 'height'],
  cylinder: ['radius', 'height'],
  sector: ['radius', 'angle', 'arc'],
});

const warned = new WeakSet();


// A value axis: { lo, hi, step, ticks }. Unfixed ends round out to a whole step.
function axis(lo, hi, { step, loFixed = false, hiFixed = false, target = 5 } = {}) {
  if (!(hi > lo)) { hi = lo + 1; hiFixed = false; }
  const s = step || niceStep(hi - lo, target);
  const a = loFixed ? lo : Math.floor(lo / s + 1e-9) * s;
  let b = hiFixed ? hi : Math.ceil(hi / s - 1e-9) * s;
  if (!(b > a)) b = a + s;
  return { lo: a, hi: b, step: s, ticks: ticks(a, b, s) };
}

/*
 * The drawn axes of a cleaned visual (see the header). Ranges:
 *   bar:    y from min(0, values) (rounded down to a step) to yMax (exact) or max(0, values)
 *           rounded up to a step; step = yStep or a 1/2/5 step giving about 5 ticks.
 *   line:   x = xMin..xMax, else the data range rounded out to a step; y = yMin..yMax, else
 *           min(0, data)..max(data) rounded out; steps = xStep / yStep or about 5 ticks.
 *   coords: exactly xMin..xMax / yMin..yMax; gridline step = a 1/2/5 step giving about 8 lines.
 */
export function visualAxes(v) {
  if (!v || typeof v !== 'object') return {};
  if (v.kind === 'bar') {
    const vals = v.series.flatMap(s => s.values).filter(x => x !== null);
    return { y: axis(Math.min(0, ...vals), v.yMax ?? Math.max(0, ...vals), { step: v.yStep, hiFixed: v.yMax !== undefined }) };
  }
  if (v.kind === 'line') {
    const pts = v.series.flatMap(s => s.points);
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    return {
      x: axis(v.xMin ?? Math.min(...xs), v.xMax ?? Math.max(...xs), { step: v.xStep, loFixed: v.xMin !== undefined, hiFixed: v.xMax !== undefined }),
      y: axis(v.yMin ?? Math.min(0, ...ys), v.yMax ?? Math.max(...ys), { step: v.yStep, loFixed: v.yMin !== undefined, hiFixed: v.yMax !== undefined }),
    };
  }
  if (v.kind === 'coords') {
    const sx = niceStep(v.xMax - v.xMin, 8);
    const sy = niceStep(v.yMax - v.yMin, 8);
    return {
      x: { lo: v.xMin, hi: v.xMax, step: sx, ticks: ticks(v.xMin, v.xMax, sx) },
      y: { lo: v.yMin, hi: v.yMax, step: sy, ticks: ticks(v.yMin, v.yMax, sy) },
    };
  }
  return {};
}

// A given step must give a readable number of ticks on the drawn axes.
function checkTicks(out) {
  const ax = visualAxes(out);
  for (const k of ['x', 'y']) {
    if (ax[k] && (ax[k].ticks.length < 2 || ax[k].ticks.length > MAX_TICKS + 1)) fail(`${k}Step gives ${ax[k].ticks.length < 2 ? 'too few' : 'too many'} ticks`);
  }
  return out;
}

class Bad extends Error {}
const fail = why => { throw new Bad(why); };

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_ABS;
// Control characters (other than ordinary spaces) are never plain text.
const CTRL_RE = new RegExp('[\u0000-\u001f\u007f-\u009f\u2028\u2029]');

// A plain-text string ≤ max chars (trimmed). `optional`: undefined/null/"" -> ''.
function text(v, max, what, optional = true) {
  if (v === undefined || v === null) return optional ? '' : fail(`${what} is missing`);
  if (typeof v !== 'string') fail(`${what} is not a string`);
  const t = v.trim();
  if (!t && !optional) fail(`${what} is empty`);
  if (t.length > max) fail(`${what} is longer than ${max} characters`);
  if (CTRL_RE.test(t)) fail(`${what} has control characters`);
  return t;
}
// A label that may be omitted: string ≤ max, or null (omitted). "" counts as omitted.
function label(v, max, what) {
  const t = text(v, max, what);
  return t ? t : null;
}
function bool(v, dflt, what) {
  if (v === undefined || v === null) return dflt;
  if (typeof v !== 'boolean') fail(`${what} is not true/false`);
  return v;
}
function num(v, what) {
  if (!fin(v)) fail(`${what} is not a finite number`);
  return v;
}
function optNum(v, what) {
  return v === undefined || v === null ? undefined : num(v, what);
}
function step(v, what) {
  if (v === undefined || v === null) return undefined;
  num(v, what);
  if (!(v > 0)) fail(`${what} must be above 0`);
  return v;
}
function list(v, min, max, what) {
  if (!Array.isArray(v)) fail(`${what} is not a list`);
  if (v.length < min || v.length > max) fail(`${what} needs ${min}–${max} entries`);
  return v;
}
const pick = (o, k) => (isObj(o) && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

function cleanTable(raw) {
  const columns = list(raw.columns, 1, TABLE_MAX_COLS, 'columns').map((c, i) => text(c, CELL_MAX, `column ${i + 1}`));
  const rows = list(raw.rows, 1, TABLE_MAX_ROWS, 'rows').map((r, i) => {
    if (!Array.isArray(r) || r.length !== columns.length) fail(`row ${i + 1} needs ${columns.length} cells`);
    return r.map((c, j) => {
      if (c === null || c === undefined) return null;
      if (typeof c === 'number') return num(c, `row ${i + 1}, cell ${j + 1}`);
      return text(c, CELL_MAX, `row ${i + 1}, cell ${j + 1}`);
    });
  });
  const out = { kind: 'table', columns, rows };
  if (raw.align !== undefined && raw.align !== null) {
    const align = list(raw.align, columns.length, columns.length, 'align');
    if (!align.every(a => a === 'left' || a === 'right' || a === 'center')) fail('align values must be left, right or center');
    out.align = align.slice();
  }
  return out;
}

function cleanBar(raw) {
  const categories = list(raw.categories, 1, BAR_MAX_CATEGORIES, 'categories').map((c, i) => text(c, CATEGORY_MAX, `category ${i + 1}`, false));
  const series = list(raw.series, 1, SERIES_MAX, 'series').map((s, i) => {
    if (!isObj(s)) fail(`series ${i + 1} is not an object`);
    const values = list(s.values, categories.length, categories.length, `series ${i + 1} values`)
      .map((v, j) => (v === null || v === undefined ? null : num(v, `series ${i + 1}, value ${j + 1}`)));
    return { name: text(s.name, SERIES_NAME_MAX, `series ${i + 1} name`, false), values };
  });
  const vals = series.flatMap(s => s.values).filter(v => v !== null);
  const yMax = optNum(raw.yMax, 'yMax');
  const lo = Math.min(0, ...vals);
  if (yMax !== undefined && vals.some(v => v > yMax)) fail('a value is above yMax');
  if (yMax !== undefined && !(yMax > lo)) fail('yMax must be above the lowest value and 0');
  const out = {
    kind: 'bar', categories, series,
    xLabel: text(raw.xLabel, AXIS_LABEL_MAX, 'xLabel'),
    yLabel: text(raw.yLabel, AXIS_LABEL_MAX, 'yLabel'),
    showValues: bool(raw.showValues, false, 'showValues'),
  };
  if (yMax !== undefined) out.yMax = yMax;
  const ys = step(raw.yStep, 'yStep');
  if (ys !== undefined) out.yStep = ys;
  return checkTicks(out);
}

function axisRange(min, max, what) {
  if (min !== undefined && max !== undefined && !(min < max)) fail(`${what}Min must be below ${what}Max`);
}

function cleanLine(raw) {
  const series = list(raw.series, 1, SERIES_MAX, 'series').map((s, i) => {
    if (!isObj(s)) fail(`series ${i + 1} is not an object`);
    const points = list(s.points, 1, LINE_MAX_POINTS, `series ${i + 1} points`).map((p, j) => {
      if (!Array.isArray(p) || p.length !== 2) fail(`series ${i + 1}, point ${j + 1} is not [x, y]`);
      return [num(p[0], `series ${i + 1}, point ${j + 1} x`), num(p[1], `series ${i + 1}, point ${j + 1} y`)];
    });
    return { name: text(s.name, SERIES_NAME_MAX, `series ${i + 1} name`, false), points };
  });
  const r = {};
  for (const k of ['xMin', 'xMax', 'yMin', 'yMax']) r[k] = optNum(raw[k], k);
  axisRange(r.xMin, r.xMax, 'x');
  axisRange(r.yMin, r.yMax, 'y');
  const pts = series.flatMap(s => s.points);
  if (r.xMin !== undefined && pts.some(p => p[0] < r.xMin)) fail('a point is left of xMin');
  if (r.xMax !== undefined && pts.some(p => p[0] > r.xMax)) fail('a point is right of xMax');
  if (r.yMin !== undefined && pts.some(p => p[1] < r.yMin)) fail('a point is below yMin');
  if (r.yMax !== undefined && pts.some(p => p[1] > r.yMax)) fail('a point is above yMax');
  const out = {
    kind: 'line', series,
    xLabel: text(raw.xLabel, AXIS_LABEL_MAX, 'xLabel'),
    yLabel: text(raw.yLabel, AXIS_LABEL_MAX, 'yLabel'),
    showPoints: bool(raw.showPoints, false, 'showPoints'),
    showValues: bool(raw.showValues, false, 'showValues'),
  };
  for (const k of ['xMin', 'xMax', 'yMin', 'yMax']) if (r[k] !== undefined) out[k] = r[k];
  const xs = step(raw.xStep, 'xStep');
  const ys = step(raw.yStep, 'yStep');
  if (xs !== undefined) out.xStep = xs;
  if (ys !== undefined) out.yStep = ys;
  return checkTicks(out);
}

// [{ label }] ×3; also accepts a bare string / null per entry.
function triList(v, what, extra) {
  return list(v, 3, 3, what).map((e, i) => {
    const o = isObj(e) ? e : { label: e };
    const out = { label: label(o.label, TRI_LABEL_MAX, `${what} ${i + 1} label`) };
    return extra ? extra(o, out, i) : out;
  });
}

function cleanTriangle(raw) {
  const vertices = triList(raw.vertices, 'vertex');
  const sides = triList(raw.sides, 'side');
  const angles = triList(raw.angles, 'angle', (o, out, i) => {
    if (bool(o.right, false, `angle ${i + 1} right`)) out.right = true;
    return out;
  });
  const rightAt = angles.map((a, i) => (a.right ? i : -1)).filter(i => i >= 0);
  if (rightAt.length > 1) fail('more than one right angle');
  const out = { kind: 'triangle', vertices, sides, angles, toScale: bool(raw.toScale, false, 'toScale') };
  if (raw.lengths !== undefined && raw.lengths !== null) {
    const L = list(raw.lengths, 3, 3, 'lengths').map((v, i) => num(v, `length ${i + 1}`));
    if (!L.every(v => v > 0)) fail('lengths must be above 0');
    const [a, b, c] = L;
    if (!(a + b > c * (1 + 1e-9) && b + c > a * (1 + 1e-9) && a + c > b * (1 + 1e-9))) fail('lengths do not make a triangle');
    if (rightAt.length) {
      const k = rightAt[0];
      const hyp = L[k] * L[k];
      const legs = L[(k + 1) % 3] ** 2 + L[(k + 2) % 3] ** 2;
      if (Math.abs(hyp - legs) > 0.01 * hyp) fail('the right angle does not match the lengths');
    }
    out.lengths = L;
  }
  if (out.toScale && !out.lengths) fail('toScale needs lengths');
  return out;
}

function cleanShape(raw) {
  const shape = raw.shape;
  if (typeof shape !== 'string' || !Object.prototype.hasOwnProperty.call(SHAPE_DIMS, shape)) fail('unknown shape');
  const out = { kind: 'shape', shape, toScale: bool(raw.toScale, false, 'toScale') };
  if (raw.dims !== undefined && raw.dims !== null) {
    if (!isObj(raw.dims)) fail('dims is not an object');
    const dims = {};
    for (const k of SHAPE_DIMS[shape]) {
      const v = num(pick(raw.dims, k), `dims.${k}`);
      if (!(v > 0)) fail(`dims.${k} must be above 0`);
      dims[k] = v;
    }
    if (shape === 'composite-l' && !(dims.cutWidth < dims.width && dims.cutHeight < dims.height)) fail('the cut must be smaller than the shape');
    if (shape === 'sector' && !(dims.angle < 360)) fail('the sector angle must be below 360');
    out.dims = dims;
  }
  if (out.toScale && !out.dims) fail('toScale needs dims');
  const labels = {};
  if (raw.labels !== undefined && raw.labels !== null) {
    if (!isObj(raw.labels)) fail('labels is not an object');
    for (const k of Object.keys(raw.labels)) {
      if (!SHAPE_LABELS[shape].includes(k)) fail(`unknown label "${k}" for ${shape}`);
      const t = label(raw.labels[k], SHAPE_LABEL_MAX, `labels.${k}`);
      if (t !== null) labels[k] = t;
    }
  }
  out.labels = labels;
  return out;
}

function cleanCoords(raw) {
  const w = {};
  for (const k of ['xMin', 'xMax', 'yMin', 'yMax']) w[k] = num(raw[k], k);
  axisRange(w.xMin, w.xMax, 'x');
  axisRange(w.yMin, w.yMax, 'y');
  if (w.xMax - w.xMin > MAX_ABS || w.yMax - w.yMin > MAX_ABS) fail('the window is too large');
  const points = (raw.points === undefined || raw.points === null ? [] : list(raw.points, 0, COORDS_MAX_POINTS, 'points')).map((p, i) => {
    if (!isObj(p)) fail(`point ${i + 1} is not an object`);
    const x = num(p.x, `point ${i + 1} x`);
    const y = num(p.y, `point ${i + 1} y`);
    if (x < w.xMin || x > w.xMax || y < w.yMin || y > w.yMax) fail(`point ${i + 1} is outside the window`);
    const l = label(p.label, POINT_LABEL_MAX, `point ${i + 1} label`);
    return l === null ? { x, y } : { x, y, label: l };
  });
  const segments = (raw.segments === undefined || raw.segments === null ? [] : list(raw.segments, 0, COORDS_MAX_SEGMENTS, 'segments')).map((s, i) => {
    if (!Array.isArray(s) || s.length !== 2 || !s.every(n => Number.isInteger(n) && n >= 0 && n < points.length) || s[0] === s[1]) {
      fail(`segment ${i + 1} must join two different points`);
    }
    return [s[0], s[1]];
  });
  const lines = (raw.lines === undefined || raw.lines === null ? [] : list(raw.lines, 0, COORDS_MAX_LINES, 'lines')).map((l, i) => {
    if (!isObj(l)) fail(`line ${i + 1} is not an object`);
    if (l.x !== undefined && l.x !== null) {
      if (l.m !== undefined || l.c !== undefined) fail(`line ${i + 1} has both x and m/c`);
      return { x: num(l.x, `line ${i + 1} x`) };
    }
    return { m: num(l.m, `line ${i + 1} m`), c: num(l.c, `line ${i + 1} c`) };
  });
  return { kind: 'coords', ...w, points, segments, lines, showGrid: bool(raw.showGrid, true, 'showGrid') };
}

const CLEANERS = { table: cleanTable, bar: cleanBar, line: cleanLine, triangle: cleanTriangle, shape: cleanShape, coords: cleanCoords };

export function sanitizeVisual(raw, warnKey) {
  if (raw === undefined || raw === null) return undefined;
  try {
    if (!isObj(raw)) fail('visual is not an object');
    if (!VISUAL_KINDS.includes(raw.kind)) fail(`unknown kind ${JSON.stringify(String(raw.kind)).slice(0, 40)}`);
    const out = CLEANERS[raw.kind](raw);
    const caption = text(raw.caption, CAPTION_MAX, 'caption');
    return caption ? { ...out, caption } : out;
  } catch (e) {
    if (!(e instanceof Bad)) throw e;
    if (warnKey && typeof warnKey === 'object' && !warned.has(warnKey)) {
      warned.add(warnKey);
      console.warn(`StudyBlock: a generator returned an invalid "visual" (${e.message}); it was dropped`, raw);
    }
    return undefined;
  }
}
