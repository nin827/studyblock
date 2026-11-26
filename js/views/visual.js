// Question visuals (ticket 026): visualHtml(visual) -> HTML for a table, chart, triangle, shape or
// coordinate grid. The data is validated again here with sanitizeVisual (stored attempts are not
// re-cleaned on load), and every string is escaped.
//
// Tables are a real <table> (styled as a ruled paper note). Everything else is inline SVG with a
// viewBox, role="img" and an aria-label that names the structure and only the values that are
// visible on the picture (never `lengths`, `dims`, unlabelled coordinates, or chart values when
// `showValues` is false). Colours come from CSS classes (theme tokens, light + dark); series also
// differ by pattern, dash and marker. The viewBox is VB_W wide and text is at least 13 units, so
// labels stay readable on a 360px phone.

import { sanitizeVisual, visualAxes, SHAPE_DIMS, SHAPE_LABELS } from '../lib/visual.js';
import { formatTick } from '../lib/graph.js';
import { esc } from './ui.js';

const VB_W = 280; // narrow on purpose: 13-unit text stays ≥ 12px even in the review list on a 360px phone
const F_TICK = 13;   // tick numbers, legend, categories
const F_LABEL = 14;  // axis labels, side / vertex labels
const charW = f => f * 0.6; // rough average glyph width (system UI font), for layout only
const textW = (s, f = F_TICK) => String(s).length * charW(f);
const r1 = n => Math.round(n * 10) / 10;

let seq = 0; // unique pattern ids per render (many visuals can share a page: review, History)

const minus = s => String(s).replace(/^-/, '−');
// A data value without float noise.
export function fmtValue(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  const s = String(Number(v.toPrecision(10)));
  return minus(s === '-0' ? '0' : s);
}
const fmtTick = (v, step) => minus(formatTick(v, step));
// Alt-text wording for a label: "?" is the asked value.
const say = l => (l === '?' ? '? (asked)' : l);

// ---------- shared SVG bits ----------

function txt(x, y, s, { size = F_TICK, anchor = 'middle', dy = '0.35em', cls = '', rotate = null, weight = null } = {}) {
  const tr = rotate !== null ? ` transform="rotate(${rotate} ${r1(x)} ${r1(y)})"` : '';
  return `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" text-anchor="${anchor}" dy="${dy}"${weight ? ` font-weight="${weight}"` : ''}${cls ? ` class="${cls}"` : ''}${tr}>${esc(s)}</text>`;
}
const line = (x1, y1, x2, y2, cls) => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" class="${cls}"/>`;

// Text placed next to an anchor point, pushed out along the unit normal (svg coords, y down).
function outText(x, y, nx, ny, s, { gap = 8, size = F_LABEL, weight = null, cls = 'vis-halo' } = {}) {
  const anchor = nx > 0.35 ? 'start' : nx < -0.35 ? 'end' : 'middle';
  const dy = ny > 0.35 ? '0.85em' : ny < -0.35 ? '-0.2em' : '0.35em';
  return txt(x + nx * gap, y + ny * gap, s, { size, anchor, dy, weight, cls });
}

function svgWrap(w, h, label, body, defs = '') {
  return `<svg class="vis-svg" viewBox="0 0 ${r1(w)} ${r1(h)}" role="img" aria-label="${esc(label)}" focusable="false">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}

// Every k-th tick label so labels of width `w` don't overlap along `len` px.
function labelEvery(n, w, len) {
  if (n <= 1) return 1;
  const room = len / (n - 1);
  return Math.max(1, Math.ceil((w + 6) / Math.max(1, room)));
}

// Series styling: colour class + bar pattern + line dash + marker.
const DASH = ['', '7 4', '2.5 3'];
function seriesDefs(id) {
  return `<pattern id="${id}-p2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="vis-pbg"/><rect width="3" height="6" class="vis-fill-2"/></pattern>`
    + `<pattern id="${id}-p3" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" class="vis-pbg"/><circle cx="2.5" cy="2.5" r="1.7" class="vis-fill-3"/></pattern>`;
}
const barFill = (id, s) => (s === 0 ? 'class="vis-fill-1 vis-stroke-1 vis-bar"' : `fill="url(#${id}-p${s + 1})" class="vis-stroke-${s + 1} vis-bar"`);
function marker(x, y, s) {
  const c = `vis-fill-${s + 1} vis-marker`;
  if (s === 1) return `<rect x="${r1(x - 3.5)}" y="${r1(y - 3.5)}" width="7" height="7" class="${c}"/>`;
  if (s === 2) return `<path d="M${r1(x)} ${r1(y - 4.5)}L${r1(x + 4.2)} ${r1(y + 3)}L${r1(x - 4.2)} ${r1(y + 3)}Z" class="${c}"/>`;
  return `<circle cx="${r1(x)}" cy="${r1(y)}" r="3.8" class="${c}"/>`;
}

// Legend rows (always drawn): [{ name, swatch(x, yMid) }] laid out across the width from `y`.
function legend(items, y) {
  const rows = [[]];
  let x = 8;
  for (const it of items) {
    const w = 28 + textW(it.name) + 14;
    if (x + w > VB_W - 4 && rows[rows.length - 1].length) { rows.push([]); x = 8; }
    rows[rows.length - 1].push({ ...it, x });
    x += w;
  }
  let out = '';
  rows.forEach((row, i) => {
    const ym = y + i * 20 + 8;
    for (const it of row) out += it.swatch(it.x, ym) + txt(it.x + 28, ym, it.name, { anchor: 'start' });
  });
  return { svg: `<g class="vis-legend">${out}</g>`, height: rows.length * 20 };
}

// Y axis: grid lines, ticks and numbers; returns svg. `ys(v)` maps a value to svg y.
function yAxisSvg(ax, left, right, ys, every = 1) {
  let out = '';
  ax.ticks.forEach((t, i) => {
    const y = ys(t);
    out += line(left, y, right, y, Math.abs(t) < ax.step * 1e-9 ? 'vis-zero' : 'vis-grid');
    out += line(left - 4, y, left, y, 'vis-axis');
    if (i % every === 0) out += txt(left - 7, y, fmtTick(t, ax.step), { anchor: 'end', cls: 'vis-tick' });
  });
  return out;
}
const tickW = ax => Math.max(...ax.ticks.map(t => textW(fmtTick(t, ax.step))), 8);

// ---------- table ----------

// Text cells that read as an amount ("4.50", "$1,200", "−3", "12%") align like numbers.
const NUMERIC_TEXT = /^[-−+]?[$£€¥]?\s?\d[\d,]*(\.\d+)?\s?%?$/;

function tableHtml(v) {
  const numCol = v.columns.map((_, j) => {
    const filled = v.rows.map(r => r[j]).filter(c => c !== null && c !== '' && c !== '?');
    return filled.length > 0 && filled.every(c => typeof c === 'number' || NUMERIC_TEXT.test(c));
  });
  const align = j => (v.align ? v.align[j] : numCol[j] ? 'right' : 'left');
  const cell = c => (c === null || c === '' ? '<span class="sr-only">blank</span>'
    : c === '?' ? '<span class="vis-ask-mark" aria-hidden="true">?</span><span class="sr-only">asked value</span>'
      : esc(typeof c === 'number' ? fmtValue(c) : c));
  const head = v.columns.some(c => c) ? `<thead><tr>${v.columns.map((c, j) => `<th scope="col" class="al-${align(j)}">${esc(c)}</th>`).join('')}</tr></thead>` : '';
  const body = v.rows.map(r => `<tr>${r.map((c, j) => `<td class="al-${align(j)}${c === '?' ? ' vis-ask' : ''}">${cell(c)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap vis-note"><table class="vis-table">${head}<tbody>${body}</tbody></table></div>`;
}

// ---------- bar chart ----------

function barSvg(v) {
  const id = `vis${++seq}`;
  const ax = visualAxes(v).y;
  const left = (v.yLabel ? 24 : 6) + tickW(ax) + 8;
  const right = VB_W - 8;
  const lg = legend(v.series.map((s, i) => ({ name: s.name, swatch: (x, y) => `<rect x="${x}" y="${r1(y - 7)}" width="20" height="14" ${barFill(id, i)}/>` })), 6);
  const top = 6 + lg.height + (v.showValues ? 18 : 8);
  const plotW = right - left;
  const plotH = 150;
  const slot = plotW / v.categories.length;
  const catW = Math.max(...v.categories.map(c => textW(c)));
  const rotate = catW > slot - 4;
  const catH = rotate ? (catW + F_TICK) * 0.71 + 6 : 18;
  const bottom = 6 + catH + (v.xLabel ? 22 : 0) + 4;
  const H = top + plotH + bottom;
  const ys = t => top + plotH - ((t - ax.lo) / (ax.hi - ax.lo)) * plotH;
  let body = yAxisSvg(ax, left, right, ys, labelEvery(ax.ticks.length, F_TICK, plotH));
  const nS = v.series.length;
  const gw = slot * 0.76;
  const bw = gw / nS;
  let values = '';
  v.categories.forEach((c, ci) => {
    const cx = left + ci * slot + slot / 2;
    v.series.forEach((s, si) => {
      const val = s.values[ci];
      if (val === null) return;
      const x = left + ci * slot + (slot - gw) / 2 + si * bw;
      const y0 = ys(Math.max(0, val));
      const y1 = ys(Math.min(0, val));
      body += `<rect x="${r1(x + 0.75)}" y="${r1(y0)}" width="${r1(Math.max(1, bw - 1.5))}" height="${r1(Math.max(0.5, y1 - y0))}" ${barFill(id, si)}/>`;
      if (v.showValues) {
        // A negative bar's value goes under its end, or inside the bar when that would hit the category labels.
        const inside = val < 0 && y1 + 24 > top + plotH;
        values += txt(x + bw / 2, val >= 0 ? y0 - 4 : inside ? y1 - 7 : y1 + 4, fmtValue(val), { dy: val >= 0 || inside ? '0' : '0.85em', cls: 'vis-halo vis-value' });
      }
    });
    body += line(cx, top + plotH, cx, top + plotH + 4, 'vis-axis');
    const ly = top + plotH + 8;
    body += rotate ? txt(cx + 3, ly, c, { anchor: 'end', dy: '0.6em', rotate: -45, cls: 'vis-cat' }) : txt(cx, ly, c, { dy: '0.8em', cls: 'vis-cat' });
  });
  body += line(left, top, left, top + plotH, 'vis-axis') + line(left, top + plotH, right, top + plotH, 'vis-axis');
  if (v.xLabel) body += txt(left + plotW / 2, H - 8, v.xLabel, { size: F_LABEL, dy: '0', cls: 'vis-axis-label' });
  if (v.yLabel) body += txt(14, top + plotH / 2, v.yLabel, { size: F_LABEL, rotate: -90, cls: 'vis-axis-label' });
  body += values + lg.svg;
  const parts = [`Bar chart with ${v.categories.length} ${v.categories.length === 1 ? 'category' : 'categories'}: ${v.categories.join(', ')}`,
    `Series: ${v.series.map(s => s.name).join(', ')}`,
    `${v.xLabel ? `x-axis: ${v.xLabel}. ` : ''}y-axis${v.yLabel ? `: ${v.yLabel},` : ''} from ${fmtTick(ax.lo, ax.step)} to ${fmtTick(ax.hi, ax.step)} in steps of ${fmtValue(ax.step)}`];
  if (v.showValues) {
    parts.push(v.series.map(s => `${nS > 1 ? `${s.name}: ` : 'Values: '}${v.categories.map((c, i) => `${c} ${s.values[i] === null ? 'no bar' : fmtValue(s.values[i])}`).join(', ')}`).join('. '));
  }
  return svgWrap(VB_W, H, `${parts.join('. ')}.`, body, nS > 1 ? seriesDefs(id) : '');
}

// ---------- line chart ----------

function lineSvg(v) {
  const { x: ax, y: ay } = visualAxes(v);
  const left = (v.yLabel ? 24 : 6) + tickW(ay) + 8;
  const right = VB_W - 10;
  const lg = legend(v.series.map((s, i) => ({
    name: s.name,
    swatch: (x, y) => `<line x1="${x}" y1="${r1(y)}" x2="${x + 22}" y2="${r1(y)}" class="vis-line vis-stroke-${i + 1}"${DASH[i] ? ` stroke-dasharray="${DASH[i]}"` : ''}/>${v.showPoints ? marker(x + 11, y, i) : ''}`,
  })), 6);
  const top = 6 + lg.height + (v.showValues ? 18 : 10);
  const plotW = right - left;
  const plotH = 150;
  const bottom = 6 + 18 + (v.xLabel ? 22 : 0) + 4;
  const H = top + plotH + bottom;
  const xs = t => left + ((t - ax.lo) / (ax.hi - ax.lo)) * plotW;
  const ys = t => top + plotH - ((t - ay.lo) / (ay.hi - ay.lo)) * plotH;
  let body = yAxisSvg(ay, left, right, ys, labelEvery(ay.ticks.length, F_TICK, plotH));
  const everyX = labelEvery(ax.ticks.length, Math.max(...ax.ticks.map(t => textW(fmtTick(t, ax.step)))), plotW);
  ax.ticks.forEach((t, i) => {
    const x = xs(t);
    body += line(x, top, x, top + plotH, 'vis-grid') + line(x, top + plotH, x, top + plotH + 4, 'vis-axis');
    if (i % everyX === 0) body += txt(x, top + plotH + 8, fmtTick(t, ax.step), { dy: '0.8em', cls: 'vis-tick' });
  });
  body += line(left, top, left, top + plotH, 'vis-axis') + line(left, top + plotH, right, top + plotH, 'vis-axis');
  let marks = '';
  v.series.forEach((s, i) => {
    const d = s.points.map((p, j) => `${j ? 'L' : 'M'}${r1(xs(p[0]))} ${r1(ys(p[1]))}`).join('');
    body += `<path d="${d}" class="vis-line vis-stroke-${i + 1}"${DASH[i] ? ` stroke-dasharray="${DASH[i]}"` : ''}/>`;
    for (const p of s.points) {
      if (v.showPoints) marks += marker(xs(p[0]), ys(p[1]), i);
      if (v.showValues) marks += txt(xs(p[0]), ys(p[1]) - 7, fmtValue(p[1]), { dy: '0', cls: 'vis-halo vis-value' });
    }
  });
  if (v.xLabel) body += txt(left + plotW / 2, H - 8, v.xLabel, { size: F_LABEL, dy: '0', cls: 'vis-axis-label' });
  if (v.yLabel) body += txt(14, top + plotH / 2, v.yLabel, { size: F_LABEL, rotate: -90, cls: 'vis-axis-label' });
  body += marks + lg.svg;
  const range = (a, name, label) => `${name}${label ? `: ${label},` : ''} from ${fmtTick(a.lo, a.step)} to ${fmtTick(a.hi, a.step)} in steps of ${fmtValue(a.step)}`;
  const parts = [`Line chart with ${v.series.length === 1 ? '1 line' : `${v.series.length} lines`}: ${v.series.map(s => s.name).join(', ')}`,
    range(ax, 'x-axis', v.xLabel), range(ay, 'y-axis', v.yLabel)];
  if (v.showValues) parts.push(v.series.map(s => `${s.name}: ${s.points.map(p => `(${fmtValue(p[0])}, ${fmtValue(p[1])})`).join(', ')}`).join('. '));
  return svgWrap(VB_W, H, `${parts.join('. ')}.`, body);
}

// ---------- geometry helpers (math coords, y up) ----------

// Fits math-coord points into a box; returns { T(x, y) -> [sx, sy], W, H, s }.
function fit(points, { maxW = 200, maxH = 170, padX = 40, padTop = 30, padBottom = 30, minH = 0 } = {}) {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  const y0 = Math.min(...ys); const y1 = Math.max(...ys);
  const bw = Math.max(1e-9, x1 - x0); const bh = Math.max(1e-9, y1 - y0);
  const s = Math.min((Math.min(maxW, VB_W - 2 * padX)) / bw, maxH / bh);
  const w = bw * s; const h = bh * s;
  const H = Math.max(minH, h + padTop + padBottom);
  const ox = (VB_W - w) / 2;
  const oy = padTop + (H - padTop - padBottom - h) / 2;
  return { T: (x, y) => [ox + (x - x0) * s, oy + (y1 - y) * s], H, s };
}
const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

// Label for the edge P->Q (svg coords) pushed away from point `away` (svg coords).
// `opts.at` = where along the edge (0 = P, 1 = Q; default the middle).
function edgeLabel(P, Q, away, s, opts = {}) {
  const at = opts.at ?? 0.5;
  const mx = P[0] + (Q[0] - P[0]) * at; const my = P[1] + (Q[1] - P[1]) * at;
  let [nx, ny] = unit(-(Q[1] - P[1]), Q[0] - P[0]);
  if ((away[0] - mx) * nx + (away[1] - my) * ny > 0) { nx = -nx; ny = -ny; }
  return outText(mx, my, nx, ny, s, opts);
}
const pathOf = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join('');
function rightMark(V, A, B, size) {
  const [ux, uy] = unit(A[0] - V[0], A[1] - V[1]);
  const [vx, vy] = unit(B[0] - V[0], B[1] - V[1]);
  return `<path d="M${r1(V[0] + ux * size)} ${r1(V[1] + uy * size)}L${r1(V[0] + (ux + vx) * size)} ${r1(V[1] + (uy + vy) * size)}L${r1(V[0] + vx * size)} ${r1(V[1] + vy * size)}" class="vis-mark"/>`;
}
// Arc at V between directions to A and B (svg coords), radius r.
function angleArc(V, A, B, r) {
  const [ux, uy] = unit(A[0] - V[0], A[1] - V[1]);
  const [vx, vy] = unit(B[0] - V[0], B[1] - V[1]);
  const sweep = ux * vy - uy * vx > 0 ? 1 : 0;
  const large = 0; // interior angles are below 180°
  return `<path d="M${r1(V[0] + ux * r)} ${r1(V[1] + uy * r)}A${r1(r)} ${r1(r)} 0 ${large} ${sweep} ${r1(V[0] + vx * r)} ${r1(V[1] + vy * r)}" class="vis-mark"/>`;
}
const notToScale = toScale => (toScale ? '' : '<p class="vis-scale-note">Not drawn to scale</p>');

// ---------- triangle ----------

function trianglePoints(v) {
  if (v.toScale && v.lengths) {
    const [a, b, c] = v.lengths; // a = BC (opposite A), b = CA, c = AB
    const ax = (c * c - b * b + a * a) / (2 * a);
    const ay = Math.sqrt(Math.max(0, c * c - ax * ax));
    return [[ax, ay], [0, 0], [a, 0]];
  }
  const r = v.angles.findIndex(x => x.right);
  if (r >= 0) {
    const p = [];
    p[r] = [0, 0]; p[(r + 1) % 3] = [4, 0]; p[(r + 2) % 3] = [0, 3];
    return p;
  }
  return [[1.3, 2.7], [0, 0], [4, 0]];
}

function triangleSvg(v) {
  const m = trianglePoints(v);
  const sideW = Math.max(0, ...v.sides.map(s => (s.label ? textW(s.label, F_LABEL) : 0)));
  const f = fit(m, { maxW: 230, maxH: 170, padX: Math.max(32, Math.min(64, sideW + 14)), padTop: 34, padBottom: 34 });
  const P = m.map(p => f.T(p[0], p[1]));
  const cx = (P[0][0] + P[1][0] + P[2][0]) / 3;
  const cy = (P[0][1] + P[1][1] + P[2][1]) / 3;
  let body = `<path d="${pathOf(P)}Z" class="vis-shape"/>`;
  const names = v.vertices.map((x, i) => x.label || `vertex ${i + 1}`);
  v.angles.forEach((a, i) => {
    const V = P[i]; const A = P[(i + 1) % 3]; const B = P[(i + 2) % 3];
    const adj = Math.min(Math.hypot(A[0] - V[0], A[1] - V[1]), Math.hypot(B[0] - V[0], B[1] - V[1]));
    if (a.right) body += rightMark(V, A, B, Math.min(12, adj * 0.25));
    else if (a.label) body += angleArc(V, A, B, Math.min(18, adj * 0.3));
    if (a.label) {
      const [ux, uy] = unit(A[0] - V[0], A[1] - V[1]);
      const [wx, wy] = unit(B[0] - V[0], B[1] - V[1]);
      const [bx, by] = unit(ux + wx, uy + wy);
      const d = Math.min(adj * 0.45, (a.right ? 12 : 18) + 16);
      body += txt(V[0] + bx * d, V[1] + by * d, a.label, { size: F_TICK, cls: 'vis-halo vis-angle-label' });
    }
  });
  v.sides.forEach((s, i) => {
    if (s.label) body += edgeLabel(P[(i + 1) % 3], P[(i + 2) % 3], [cx, cy], s.label, { size: F_LABEL });
  });
  v.vertices.forEach((x, i) => {
    if (!x.label) return;
    const [ux, uy] = unit(P[i][0] - cx, P[i][1] - cy);
    body += outText(P[i][0], P[i][1], ux, uy, x.label, { gap: 9, size: F_LABEL + 1, weight: 600 });
  });
  const vname = v.vertices.every(x => x.label) ? ` ${v.vertices.map(x => x.label).join('')}` : '';
  const ri = v.angles.findIndex(a => a.right);
  const parts = [`Triangle${vname}${ri >= 0 ? `, right angle at ${names[ri]}` : ''}`];
  v.sides.forEach((s, i) => {
    const a = v.vertices[(i + 1) % 3].label; const b = v.vertices[(i + 2) % 3].label;
    const nm = a && b ? `side ${a}${b}` : `side opposite ${names[i]}`;
    parts.push(`${nm}: ${s.label ? say(s.label) : 'not labelled'}`);
  });
  v.angles.forEach((a, i) => { if (a.label) parts.push(`angle at ${names[i]}: ${say(a.label)}`); });
  parts.push(v.toScale ? 'Drawn to scale' : 'Not drawn to scale');
  return svgWrap(VB_W, f.H, `${parts.join('. ')}.`, body);
}

// ---------- shapes ----------

const SHAPE_DEFAULTS = {
  rectangle: { width: 3, height: 2 },
  circle: { radius: 1 },
  'composite-l': { width: 4, height: 3, cutWidth: 2, cutHeight: 1.4 },
  cuboid: { length: 4, width: 3, height: 2.4 },
  cylinder: { radius: 1, height: 2.2 },
  sector: { radius: 1, angle: 70 },
};
const SHAPE_NAMES = { rectangle: 'Rectangle', circle: 'Circle', 'composite-l': 'L-shape', cuboid: 'Cuboid', cylinder: 'Cylinder', sector: 'Sector' };
const DIM_WORDS = { width: 'width', height: 'height', cutWidth: 'cut-out width', cutHeight: 'cut-out height', topWidth: 'top edge', rightHeight: 'right edge', length: 'length', radius: 'radius', diameter: 'diameter', angle: 'angle', arc: 'arc length' };

function shapeDims(v) {
  if (v.toScale && v.dims) return v.dims;
  const d = { ...SHAPE_DEFAULTS[v.shape] };
  // A sector's look depends on its angle: use the real one when given (clamped so it stays readable).
  if (v.shape === 'sector' && v.dims) d.angle = Math.min(340, Math.max(20, v.dims.angle));
  return d;
}

function shapeSvg(v) {
  const d = shapeDims(v);
  const L = v.labels || {};
  let body = '';
  let H;
  const lab = (k, P, Q, away, opts) => (L[k] ? edgeLabel(P, Q, away, L[k], { size: F_LABEL, ...opts }) : '');
  if (v.shape === 'rectangle' || v.shape === 'composite-l') {
    const { width: w, height: h } = d;
    const m = v.shape === 'rectangle' ? [[0, 0], [w, 0], [w, h], [0, h]]
      : [[0, 0], [w, 0], [w, h - d.cutHeight], [w - d.cutWidth, h - d.cutHeight], [w - d.cutWidth, h], [0, h]];
    const f = fit(m, { maxW: 210, maxH: 150, padX: 60, padTop: 28, padBottom: 30 });
    const P = m.map(p => f.T(p[0], p[1]));
    H = f.H;
    body += `<path d="${pathOf(P)}Z" class="vis-shape"/>`;
    const inside = f.T(v.shape === 'rectangle' ? w / 2 : (w - d.cutWidth) / 2, v.shape === 'rectangle' ? h / 2 : (h - d.cutHeight) / 2);
    body += lab('width', P[0], P[1], inside);
    if (v.shape === 'rectangle') {
      body += lab('height', P[1], P[2], inside);
    } else {
      body += lab('height', P[5], P[0], inside);
      body += lab('rightHeight', P[1], P[2], inside);
      // The two notch edges meet at P[3]: keep their labels apart, away from that corner.
      body += lab('cutWidth', P[2], P[3], inside, { at: 0.35 });
      body += lab('cutHeight', P[3], P[4], f.T(0, h - d.cutHeight), { at: 0.65 });
      body += lab('topWidth', P[4], P[5], inside);
    }
  } else if (v.shape === 'circle') {
    const r = d.radius;
    const f = fit([[-r, -r], [r, r]], { maxW: 160, maxH: 160, padX: 40, padTop: 20, padBottom: 20 });
    const C = f.T(0, 0); const R = r * f.s;
    H = f.H;
    body += `<circle cx="${r1(C[0])}" cy="${r1(C[1])}" r="${r1(R)}" class="vis-shape"/>`;
    if (L.diameter) {
      body += line(C[0] - R, C[1], C[0] + R, C[1], 'vis-edge') + txt(C[0], C[1] - 7, L.diameter, { size: F_LABEL, dy: '0', cls: 'vis-halo' });
    }
    if (L.radius || !L.diameter) {
      const [ex, ey] = L.diameter ? [C[0] + R * 0.6, C[1] + R * 0.8] : [C[0] + R, C[1]];
      body += line(C[0], C[1], ex, ey, 'vis-edge');
      if (L.radius) body += edgeLabel(C, [ex, ey], L.diameter ? [C[0], C[1] - R] : [C[0], C[1] + R], L.radius, { size: F_LABEL });
    }
    body += `<circle cx="${r1(C[0])}" cy="${r1(C[1])}" r="2.5" class="vis-dot"/>`;
  } else if (v.shape === 'cuboid') {
    const { length: l, width: w, height: h } = d;
    const dx = w * 0.5 * Math.cos(Math.PI / 6); const dy = w * 0.5 * Math.sin(Math.PI / 6);
    const m = [[0, 0], [l, 0], [l, h], [0, h], [dx, dy], [l + dx, dy], [l + dx, h + dy], [dx, h + dy]];
    const f = fit(m, { maxW: 220, maxH: 160, padX: 56, padTop: 22, padBottom: 30 });
    const P = m.map(p => f.T(p[0], p[1]));
    H = f.H;
    body += `<path d="${pathOf([P[0], P[1], P[5], P[6], P[7], P[3]])}Z" class="vis-shape"/>`;
    body += line(P[4][0], P[4][1], P[0][0], P[0][1], 'vis-edge vis-hidden') + line(P[4][0], P[4][1], P[5][0], P[5][1], 'vis-edge vis-hidden') + line(P[4][0], P[4][1], P[7][0], P[7][1], 'vis-edge vis-hidden');
    body += `<path d="${pathOf([P[3], P[2], P[1]])}M${r1(P[2][0])} ${r1(P[2][1])}L${r1(P[6][0])} ${r1(P[6][1])}" class="vis-edge" fill="none"/>`;
    const mid = f.T((l + dx) / 2, (h + dy) / 2);
    body += lab('length', P[0], P[1], mid);
    body += lab('height', P[3], P[0], mid);
    body += lab('width', P[1], P[5], mid);
  } else if (v.shape === 'cylinder') {
    const { radius: r, height: h } = d;
    const k = 0.32; // ellipse squash
    const f = fit([[-r, -r * k], [r, h + r * k]], { maxW: 170, maxH: 170, padX: 50, padTop: 20, padBottom: 22 });
    const T = f.T; const R = r * f.s; const RY = r * k * f.s;
    H = f.H;
    const top = T(0, h); const bot = T(0, 0);
    body += `<path d="M${r1(top[0] - R)} ${r1(top[1])}L${r1(bot[0] - R)} ${r1(bot[1])}A${r1(R)} ${r1(RY)} 0 0 0 ${r1(bot[0] + R)} ${r1(bot[1])}L${r1(top[0] + R)} ${r1(top[1])}Z" class="vis-shape"/>`;
    body += `<path d="M${r1(bot[0] - R)} ${r1(bot[1])}A${r1(R)} ${r1(RY)} 0 0 1 ${r1(bot[0] + R)} ${r1(bot[1])}" class="vis-edge vis-hidden" fill="none"/>`;
    body += `<ellipse cx="${r1(top[0])}" cy="${r1(top[1])}" rx="${r1(R)}" ry="${r1(RY)}" class="vis-shape vis-top"/>`;
    body += line(top[0], top[1], top[0] + R, top[1], 'vis-edge') + `<circle cx="${r1(top[0])}" cy="${r1(top[1])}" r="2.5" class="vis-dot"/>`;
    if (L.radius) body += txt(top[0] + R / 2, top[1] - RY - 6, L.radius, { size: F_LABEL, dy: '0', cls: 'vis-halo' });
    if (L.height) body += outText(top[0] + R, (top[1] + bot[1]) / 2, 1, 0, L.height);
  } else if (v.shape === 'sector') {
    const r = d.radius; const a = d.angle * Math.PI / 180;
    const ext = [[0, 0], [r, 0], [r * Math.cos(a), r * Math.sin(a)]];
    for (const q of [Math.PI / 2, Math.PI, 1.5 * Math.PI]) if (q < a) ext.push([r * Math.cos(q), r * Math.sin(q)]);
    const f = fit(ext, { maxW: 200, maxH: 160, padX: 50, padTop: 26, padBottom: 28 });
    const O = f.T(0, 0); const A = f.T(r, 0); const B = f.T(r * Math.cos(a), r * Math.sin(a)); const R = r * f.s;
    H = f.H;
    body += `<path d="M${r1(O[0])} ${r1(O[1])}L${r1(A[0])} ${r1(A[1])}A${r1(R)} ${r1(R)} 0 ${a > Math.PI ? 1 : 0} 0 ${r1(B[0])} ${r1(B[1])}Z" class="vis-shape"/>`;
    const ar = Math.min(20, R * 0.3);
    const [bx, by] = [Math.cos(a / 2), -Math.sin(a / 2)];
    body += `<path d="M${r1(O[0] + ar)} ${r1(O[1])}A${r1(ar)} ${r1(ar)} 0 ${a > Math.PI ? 1 : 0} 0 ${r1(O[0] + ar * Math.cos(a))} ${r1(O[1] - ar * Math.sin(a))}" class="vis-mark"/>`;
    if (L.radius) body += edgeLabel(O, A, [O[0], O[1] - 10], L.radius, { size: F_LABEL });
    if (L.angle) body += txt(O[0] + bx * (ar + 16), O[1] + by * (ar + 16), L.angle, { size: F_TICK, cls: 'vis-halo vis-angle-label' });
    if (L.arc) body += outText(O[0] + bx * R, O[1] + by * R, bx, by, L.arc);
  }
  const shown = SHAPE_LABELS[v.shape].filter(k => L[k]).map(k => `${DIM_WORDS[k]}: ${say(L[k])}`);
  const missing = SHAPE_DIMS[v.shape].filter(k => !L[k] && !(k === 'radius' && L.diameter)).map(k => `${DIM_WORDS[k]} not labelled`);
  const label = [SHAPE_NAMES[v.shape], ...shown, ...missing, v.toScale ? 'Drawn to scale' : 'Not drawn to scale'].join('. ');
  return svgWrap(VB_W, H, `${label}.`, body);
}

// ---------- coordinate grid ----------

// Clips the segment to the box; null when nothing is inside (Liang–Barsky).
function clip(x0, y0, x1, y1, b) {
  let t0 = 0; let t1 = 1;
  const dx = x1 - x0; const dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - b.xMin], [dx, b.xMax - x0], [-dy, y0 - b.yMin], [dy, b.yMax - y0]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

function coordsSvg(v) {
  const { x: gx, y: gy } = visualAxes(v);
  const sx = gx.step; const sy = gy.step; const tx = gx.ticks; const ty = gy.ticks;
  const yAxisX = v.xMin <= 0 && v.xMax >= 0 ? 0 : v.xMin;
  const xAxisY = v.yMin <= 0 && v.yMax >= 0 ? 0 : v.yMin;
  const tyW = Math.max(8, ...ty.map(t => textW(fmtTick(t, sy))));
  const left = (yAxisX === v.xMin ? tyW + 10 : 8) + 4;
  const right = 18; // room for the "x" axis name
  const plotMaxW = VB_W - left - right;
  const xspan = v.xMax - v.xMin; const yspan = v.yMax - v.yMin;
  let u = Math.min(plotMaxW / xspan, 240 / yspan);
  let ux = u; let uy = u;
  if (yspan * u < 120) uy = 120 / yspan; // a very flat window: unequal scale rather than unreadable
  if (xspan * ux < 160) ux = plotMaxW / xspan;
  const plotW = xspan * ux; const plotH = yspan * uy;
  const top = 20;
  const bottom = xAxisY === v.yMin ? 24 : 10;
  const H = top + plotH + bottom;
  const ox = left + (plotMaxW - plotW) / 2;
  const X = x => ox + (x - v.xMin) * ux;
  const Y = y => top + (v.yMax - y) * uy;
  let body = '';
  if (v.showGrid) {
    for (const t of tx) body += line(X(t), top, X(t), top + plotH, 'vis-grid');
    for (const t of ty) body += line(ox, Y(t), ox + plotW, Y(t), 'vis-grid');
  }
  body += `<rect x="${r1(ox)}" y="${r1(top)}" width="${r1(plotW)}" height="${r1(plotH)}" class="vis-frame"/>`;
  const ax = Y(xAxisY); const ay = X(yAxisX);
  body += line(ox, ax, ox + plotW + 8, ax, 'vis-axis vis-axis-main') + line(ay, top + plotH, ay, top - 8, 'vis-axis vis-axis-main');
  body += txt(ox + plotW + 11, ax, 'x', { anchor: 'start', size: F_LABEL, cls: 'vis-axis-label' });
  body += txt(ay, top - 11, 'y', { size: F_LABEL, dy: '0', cls: 'vis-axis-label' });
  const everyX = labelEvery(tx.length, Math.max(...tx.map(t => textW(fmtTick(t, sx)))), plotW);
  const everyY = labelEvery(ty.length, F_TICK, plotH);
  const isZero = (t, s) => Math.abs(t) < s * 1e-9;
  const originShared = yAxisX === 0 && xAxisY === 0;
  tx.forEach((t, i) => {
    body += line(X(t), ax - 3, X(t), ax + 3, 'vis-axis');
    if (i % everyX || (isZero(t, sx) && originShared)) return;
    body += txt(X(t), ax + 6, fmtTick(t, sx), { dy: '0.8em', cls: 'vis-halo vis-tick' });
  });
  ty.forEach((t, i) => {
    body += line(ay - 3, Y(t), ay + 3, Y(t), 'vis-axis');
    if (i % everyY || (isZero(t, sy) && originShared)) return;
    body += txt(ay - 6, Y(t), fmtTick(t, sy), { anchor: 'end', cls: 'vis-halo vis-tick' });
  });
  if (originShared) body += txt(ay - 5, ax + 5, '0', { anchor: 'end', dy: '0.8em', cls: 'vis-halo vis-tick' });
  const box = { xMin: v.xMin, xMax: v.xMax, yMin: v.yMin, yMax: v.yMax };
  const LDASH = ['', '7 4', '2.5 3', '10 3 2 3'];
  v.lines.forEach((l, i) => {
    const seg = 'x' in l ? (l.x >= v.xMin && l.x <= v.xMax ? [l.x, v.yMin, l.x, v.yMax] : null)
      : clip(v.xMin, l.m * v.xMin + l.c, v.xMax, l.m * v.xMax + l.c, box);
    if (!seg) return;
    body += `<line x1="${r1(X(seg[0]))}" y1="${r1(Y(seg[1]))}" x2="${r1(X(seg[2]))}" y2="${r1(Y(seg[3]))}" class="vis-line vis-stroke-${i + 1}"${LDASH[i] ? ` stroke-dasharray="${LDASH[i]}"` : ''}/>`;
  });
  for (const [i, j] of v.segments) {
    const a = v.points[i]; const b = v.points[j];
    body += line(X(a.x), Y(a.y), X(b.x), Y(b.y), 'vis-edge');
  }
  for (const p of v.points) {
    body += `<circle cx="${r1(X(p.x))}" cy="${r1(Y(p.y))}" r="4" class="vis-dot"/>`;
    if (p.label) body += txt(X(p.x) + 6, Y(p.y) - 6, p.label, { anchor: X(p.x) > ox + plotW - 40 ? 'end' : 'start', dy: '0', size: F_LABEL, weight: 600, cls: 'vis-halo' });
  }
  const named = v.points.filter(p => p.label).map(p => p.label);
  const nm = i => v.points[i].label || `point ${i + 1}`;
  const parts = [`Coordinate grid, x from ${fmtTick(v.xMin, sx)} to ${fmtTick(v.xMax, sx)}, y from ${fmtTick(v.yMin, sy)} to ${fmtTick(v.yMax, sy)}${v.showGrid ? ', gridlines every ' + fmtValue(sx) + (sx === sy ? '' : ` across and ${fmtValue(sy)} up`) : ''}`];
  if (v.points.length) parts.push(`${v.points.length} ${v.points.length === 1 ? 'point' : 'points'}${named.length ? `: ${named.join(', ')}` : ''}${named.length && named.length < v.points.length ? ` and ${v.points.length - named.length} unlabelled` : ''}`);
  if (v.segments.length) parts.push(`segments ${v.segments.map(([i, j]) => `${nm(i)} to ${nm(j)}`).join(', ')}`);
  if (v.lines.length) parts.push(`${v.lines.length} ${v.lines.length === 1 ? 'line' : 'lines'}`);
  return svgWrap(VB_W, H, `${parts.join('. ')}.`, body);
}

// ---------- entry point ----------

const RENDER = { bar: barSvg, line: lineSvg, triangle: triangleSvg, shape: shapeSvg, coords: coordsSvg };

// HTML for a question's `visual` ('' when absent or invalid). Safe for stored / imported data.
export function visualHtml(raw) {
  const v = sanitizeVisual(raw);
  if (!v) return '';
  let inner;
  try {
    inner = v.kind === 'table' ? tableHtml(v) : RENDER[v.kind](v);
  } catch (e) {
    console.error('StudyBlock: could not draw a question visual', e);
    return '';
  }
  const note = v.kind === 'triangle' || v.kind === 'shape' ? notToScale(v.toScale) : '';
  return `<figure class="q-visual q-visual-${v.kind}">${v.caption ? `<figcaption class="q-visual-caption">${esc(v.caption)}</figcaption>` : ''}${inner}${note}</figure>`;
}
