// Graph mode of the quiz calculator: a function list (y1 … y6), a canvas plot with pan / zoom /
// trace, and key points (zeros, minima, maxima, intersections). Mounted by calculator.js.
// The maths lives in js/lib/graph.js and js/lib/calc.js; this file is DOM only.
//
// mountGraph(container, { state, getLookup, onChange, onAddValue, tall })
//   state       { fns: [{ slot, expr, hidden, given?, label? }], view: { xmin, xmax, ymin, ymax } } or null
//   getLookup() -> lookup(nameLowerCase) for sheet rows (same rules as the sheet, see calc.sheetLookup)
//   onChange()  the graph state changed (calculator.js saves it with the sheet)
//   onAddValue(number) -> { ok: true, label, expr } | { ok: false, message }
//   tall        true on the standalone Calculator page (a taller plot on phones)
// -> { refresh(), setActive(bool), focus(), getState(), snapshot(), setGiven(fns, view), hasGiven(),
//      reset(), renameRef(old, new), destroy() }
//
// Given functions (a question's `graphFns`, like the sheet's given rows): setGiven() drops the
// functions still flagged `given` and adds the new ones in the lowest free slots, with a "given"
// tag. Editing a given function's expression clears its flag, so it stays for later questions.
//
// User text reaches the DOM only through textContent / attributes; canvas text uses fillText.

import { parse, evaluate, calc, CalcError, formatValue, renameLabel, MAX_EXPR } from '../lib/calc.js';
import {
  niceStep, ticks, formatTick, roundToPixel, sampleCurve, findZeros, findExtrema, findIntersections,
  fitY, clampView, defaultView, validView, MIN_SPAN, MAX_SPAN, MAX_POINTS,
} from '../lib/graph.js';
import { icon, icons } from './ui.js';

export const MAX_FNS = 6;
export const GIVEN_FNS_MAX = 3;
export const GIVEN_LABEL_MAX = 40;
const ZOOM = 1.5;
const PHONE = '(max-width: 899px)';
let uid = 0;

// Validates a stored graph state (sessionStorage). Returns a clean copy or null.
export function cleanGraphState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const fns = [];
  const used = new Set();
  for (const f of Array.isArray(raw.fns) ? raw.fns.slice(0, MAX_FNS) : []) {
    if (!f || typeof f !== 'object' || typeof f.expr !== 'string') continue;
    const slot = Number(f.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > MAX_FNS || used.has(slot)) continue;
    used.add(slot);
    const label = f.given === true && typeof f.label === 'string' ? f.label.trim().slice(0, GIVEN_LABEL_MAX) : '';
    fns.push({ slot, expr: f.expr.slice(0, MAX_EXPR), hidden: f.hidden === true, ...(f.given === true ? { given: true } : {}), ...(label ? { label } : {}) });
  }
  fns.sort((a, b) => a.slot - b.slot);
  const view = validView(raw.view) ? clampView(raw.view) : defaultView();
  return { fns: fns.length ? fns : [{ slot: 1, expr: '', hidden: false }], view };
}

function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

// Constant icon markup only (icon() restricts names to [a-z0-9-]).
function withIcon(node, name, text) {
  node.innerHTML = icon(name);
  if (text) {
    const s = el('span');
    s.textContent = text;
    node.appendChild(s);
  }
  return node;
}

const fmt = v => {
  try { return formatValue(v); } catch { return String(v); }
};

// Row names (original spelling) used in an AST.
function refNames(ast, out = []) {
  if (!ast) return out;
  if (ast.k === 'ref') out.push(ast.name);
  else if (ast.k === 'neg') refNames(ast.a, out);
  else if (ast.k === 'bin') { refNames(ast.a, out); refNames(ast.b, out); }
  else if (ast.k === 'call') ast.args.forEach(a => refNames(a, out));
  return out;
}

// Canvas colours from the theme tokens of `node` (light/dark and accent follow the page).
export function plotColors(node) {
  const cs = getComputedStyle(node);
  const g = name => cs.getPropertyValue(name).trim();
  return {
    bg: g('--surface') || '#fff',
    grid: g('--line') || '#ddd',
    axis: g('--muted') || '#666',
    text: g('--text-2') || '#444',
    fns: [1, 2, 3, 4, 5, 6].map(i => g(`--graph-${i}`) || '#36c'),
  };
}

/*
 * Paints the background, grid, axes, tick labels, curves and each curve's name (y1 …) onto a
 * 2D context sized W × H CSS pixels at `dpr`. Shared by the live graph and the static plots in
 * the review / History (js/views/staticgraph.js).
 *   curves: [{ slot, f }] with f(x) -> number (NaN where undefined)
 * -> { empty: Set(slot) } curves with no value anywhere in the view.
 */
export function paintPlot(ctx, { W, H, dpr = 1, view, curves, c, font }) {
  const family = font || 'system-ui, sans-serif';
  const toPx = x => ((x - view.xmin) / (view.xmax - view.xmin)) * W;
  const toPy = y => ((view.ymax - y) / (view.ymax - view.ymin)) * H;
  const clampPy = py => Math.max(-4 * H, Math.min(5 * H, py));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  // grid + axes
  const xStep = niceStep(view.xmax - view.xmin, Math.max(2, Math.floor(W / 56)));
  const yStep = niceStep(view.ymax - view.ymin, Math.max(2, Math.floor(H / 44)));
  const xt = ticks(view.xmin, view.xmax, xStep);
  const yt = ticks(view.ymin, view.ymax, yStep);
  ctx.lineWidth = 1;
  ctx.strokeStyle = c.grid;
  ctx.beginPath();
  xt.forEach(x => { const px = Math.round(toPx(x)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, H); });
  yt.forEach(y => { const py = Math.round(toPy(y)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(W, py); });
  ctx.stroke();

  const ax = Math.round(toPx(0)) + 0.5; // y axis (x = 0)
  const ay = Math.round(toPy(0)) + 0.5; // x axis (y = 0)
  ctx.strokeStyle = c.axis;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  if (ax >= 0 && ax <= W) { ctx.moveTo(ax, 0); ctx.lineTo(ax, H); }
  if (ay >= 0 && ay <= H) { ctx.moveTo(0, ay); ctx.lineTo(W, ay); }
  ctx.stroke();

  // tick labels (kept inside the canvas when an axis is off-screen)
  ctx.font = `11px ${family}`;
  ctx.fillStyle = c.text;
  ctx.lineWidth = 3;
  ctx.strokeStyle = c.bg;
  ctx.lineJoin = 'round';
  const labelY = Math.min(Math.max(ay + 4, 2), H - 14);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  xt.forEach(x => {
    if (Math.abs(x) < xStep * 1e-6 && ax >= 0 && ax <= W) return; // 0 drawn once, by the y labels
    const px = toPx(x);
    if (px < 10 || px > W - 10) return;
    const s = formatTick(x, xStep);
    ctx.strokeText(s, px, labelY);
    ctx.fillText(s, px, labelY);
  });
  const leftSide = ax > W - 40;
  ctx.textAlign = leftSide ? 'right' : 'left';
  ctx.textBaseline = 'middle';
  const labelX = leftSide ? Math.min(ax - 4, W - 2) : Math.max(Math.min(ax + 4, W - 36), 2);
  yt.forEach(y => {
    const py = toPy(y);
    if (py < 8 || py > H - 8) return;
    const s = formatTick(y, yStep);
    ctx.strokeText(s, labelX, py);
    ctx.fillText(s, labelX, py);
  });

  // curves
  const n = Math.max(50, Math.min(2000, Math.round(W * dpr)));
  const jump = view.ymax - view.ymin;
  const labels = [];
  const empty = new Set();
  for (const { slot, f } of curves) {
    const color = c.fns[slot - 1];
    const { xs, ys, brk } = sampleCurve(f, view.xmin, view.xmax, n, jump);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.25;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let any = false;
    let last = null;
    for (let i = 0; i <= n; i++) {
      const y = ys[i];
      if (y !== y) continue; // NaN
      any = true;
      const px = toPx(xs[i]);
      const py = clampPy(toPy(y));
      if (brk[i]) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      if (py >= 0 && py <= H) last = { px, py };
    }
    ctx.stroke();
    if (!any) empty.add(slot);
    if (last) labels.push({ slot, color, ...last });
  }

  // name labels near each curve's last visible point (names, not colour alone)
  ctx.font = `600 12px ${family}`;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'right';
  ctx.lineWidth = 3;
  ctx.strokeStyle = c.bg;
  const placed = [];
  labels.forEach(l => {
    const x = Math.max(24, Math.min(W - 4, l.px - 4));
    let y = Math.max(16, Math.min(H - 2, l.py - 4));
    while (placed.some(q => Math.abs(q.x - x) < 26 && Math.abs(q.y - y) < 14) && y < H - 2) y += 14;
    placed.push({ x, y });
    ctx.strokeText(`y${l.slot}`, x, y);
    ctx.fillStyle = l.color;
    ctx.fillText(`y${l.slot}`, x, y);
  });
  return { empty };
}

export function mountGraph(container, { state, getLookup, onChange, onAddValue, tall = false } = {}) {
  const id = `graph${++uid}`;
  const init = cleanGraphState(state) || cleanGraphState({});
  let fns = init.fns;
  let view = init.view;
  let active = false;
  let prepared = new Map(); // slot -> { f } | { error } | { blank }
  const parseCache = new Map(); // expr -> { ast } | { error }
  let trace = null; // { slot, x }
  let pointsFor = null; // slot whose key points are listed
  let points = null; // { slot, zeros, minima, maxima, inter: [{ slot, pts }], capped }
  let raf = 0;
  let pointsTimer = 0;
  let lastFocusedSlot = null;
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  const notes = new Map(); // slot -> current note text (avoid DOM churn)
  let readoutText = '';
  let readoutMsg = ''; // shown when no trace is active (e.g. "No curve has a value at x = 3.")
  let viewBeforeGiven = null; // { before, applied }: the view a question's graphView replaced

  // ---- static shell ----
  const root = el('div', 'graph');
  const plot = el('div', 'graph-plot');
  const canvas = el('canvas', 'graph-canvas', {
    tabindex: '0', role: 'application', 'aria-roledescription': 'graph',
    'aria-label': 'Graph. Drag or use the arrow keys to move, + and − to zoom, 0 to reset. Tap a curve, or press Shift and an arrow key, to trace it.',
    'aria-describedby': `${id}-readout`,
  });
  plot.appendChild(canvas);

  const tools = el('div', 'graph-tools');
  const zoomIn = withIcon(el('button', 'btn btn-small graph-tool', { type: 'button', 'aria-label': 'Zoom in' }), 'zoom-in');
  const zoomOut = withIcon(el('button', 'btn btn-small graph-tool', { type: 'button', 'aria-label': 'Zoom out' }), 'zoom-out');
  const resetBtn = withIcon(el('button', 'btn btn-small graph-tool', { type: 'button', 'aria-label': 'Reset view' }), 'rotate-ccw');
  const fitBtn = withIcon(el('button', 'btn btn-small graph-fit', { type: 'button', 'aria-label': 'Fit y to the visible curves' }), 'move-vertical', 'Fit y');
  tools.append(zoomIn, zoomOut, resetBtn, fitBtn);

  const readout = el('p', 'graph-readout', { id: `${id}-readout`, 'aria-live': 'polite' });

  const fnList = el('ol', 'graph-fns', { 'aria-label': 'Functions' });
  const foot = el('div', 'graph-foot');
  const addBtn = withIcon(el('button', 'btn btn-small graph-add', { type: 'button', 'aria-label': 'Add function' }), 'plus', 'Function');
  foot.appendChild(addBtn);
  const status = el('p', 'graph-status', { role: 'status' });

  const pointsBox = el('section', 'graph-points', { 'aria-labelledby': `${id}-pts-title` });
  pointsBox.hidden = true;

  // View window (collapsible).
  const win = el('details', 'graph-window');
  const winSum = el('summary');
  winSum.textContent = 'Window';
  const winGrid = el('div', 'graph-window-grid');
  const fields = {};
  [['xmin', 'x min'], ['xmax', 'x max'], ['ymin', 'y min'], ['ymax', 'y max']].forEach(([k, text]) => {
    const wrap = el('label', 'graph-field');
    const span = el('span');
    span.textContent = text;
    const input = el('input', 'graph-win-input', {
      type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
      spellcheck: 'false', maxlength: '40', enterkeyhint: 'done', 'data-k': k,
    });
    wrap.append(span, input);
    winGrid.appendChild(wrap);
    fields[k] = input;
  });
  const winApply = el('button', 'btn btn-small btn-soft graph-win-apply', { type: 'button' });
  winApply.textContent = 'Apply';
  const winErr = el('p', 'graph-win-err', { role: 'alert' });
  winErr.hidden = true;
  win.append(winSum, winGrid, winApply, winErr);

  const help = el('p', 'calc-help');
  help.textContent = 'Write y in terms of x, e.g. x^2 - 4 or 2*x + 1 (write 2*x, not 2x). Trig uses degrees. Sheet values like _a can be used and update live.';

  root.append(plot, readout, tools, fnList, foot, status, pointsBox, win, help);
  container.appendChild(root);

  // ---- state helpers ----
  const fnBySlot = slot => fns.find(f => f.slot === slot);
  const fnName = slot => `y${slot}`;
  const visibleSlots = () => fns.filter(f => !f.hidden && prepared.get(f.slot)?.f).map(f => f.slot);

  function persist() {
    if (typeof onChange === 'function') onChange();
  }

  function setStatus(text) {
    status.textContent = text || '';
  }

  // ---- compile functions against the current sheet ----
  function parsed(expr) {
    let p = parseCache.get(expr);
    if (!p) {
      try { p = { ast: parse(expr, { vars: ['x'] }) }; } catch (e) { p = { error: e instanceof CalcError ? e.message : 'could not read expression' }; }
      if (parseCache.size > 200) parseCache.clear();
      parseCache.set(expr, p);
    }
    return p;
  }

  function prepare(fn) {
    if (!fn.expr.trim()) return { blank: true };
    const p = parsed(fn.expr);
    if (p.error) return { error: p.error };
    let lookup;
    try { lookup = typeof getLookup === 'function' ? getLookup() : () => undefined; } catch { lookup = () => undefined; }
    const values = new Map();
    for (const name of refNames(p.ast)) {
      const low = name.toLowerCase();
      if (values.has(low)) continue;
      let v;
      try { v = lookup(low); } catch (e) { return { error: e instanceof CalcError ? e.message : `${name} has an error` }; }
      if (typeof v !== 'number' || !Number.isFinite(v)) return { error: `unknown value: ${name}` };
      values.set(low, v);
    }
    const ast = p.ast;
    const vars = { x: 0 };
    const refs = name => values.get(name);
    const f = x => {
      vars.x = x;
      try { return evaluate(ast, refs, vars); } catch { return NaN; }
    };
    return { f };
  }

  function prepareAll() {
    prepared = new Map(fns.map(fn => [fn.slot, prepare(fn)]));
    fns.forEach(fn => {
      const li = fnList.querySelector(`li[data-slot="${fn.slot}"]`);
      if (!li) return;
      const p = prepared.get(fn.slot);
      const msg = li.querySelector('.graph-fn-msg');
      const input = li.querySelector('.graph-expr');
      if (p.error) {
        msg.className = 'graph-fn-msg is-error';
        msg.innerHTML = icon('circle-alert'); // constant markup
        const s = el('span');
        s.textContent = p.error;
        msg.appendChild(s);
        input.setAttribute('aria-invalid', 'true');
        notes.set(fn.slot, `!${p.error}`);
      } else {
        if (notes.get(fn.slot)?.startsWith('!')) { msg.textContent = ''; msg.className = 'graph-fn-msg'; notes.delete(fn.slot); }
        input.setAttribute('aria-invalid', 'false');
      }
    });
    icons();
  }

  // A plain note (not an error) under a function, e.g. "No values in this view".
  function setNote(slot, text) {
    const cur = notes.get(slot) || '';
    if (cur.startsWith('!') || cur === text) return;
    const li = fnList.querySelector(`li[data-slot="${slot}"]`);
    if (!li) return;
    const msg = li.querySelector('.graph-fn-msg');
    msg.className = 'graph-fn-msg is-note';
    msg.textContent = text;
    if (text) notes.set(slot, text); else notes.delete(slot);
  }

  // ---- function list ----
  function buildFn(fn) {
    const li = el('li', `graph-fn graph-c${fn.slot}`);
    li.dataset.slot = String(fn.slot);
    if (fn.hidden) li.classList.add('is-hidden');
    const main = el('div', 'graph-fn-main');
    const exprId = `${id}-f${fn.slot}`;
    const name = el('label', 'graph-fn-name', { for: exprId });
    const sw = el('span', 'graph-swatch', { 'aria-hidden': 'true' });
    const nm = el('span');
    nm.textContent = fnName(fn.slot);
    const eq = el('span', 'sr-only');
    eq.textContent = ' equals';
    name.append(sw, nm, eq);
    const eqv = el('span', 'calc-eq', { 'aria-hidden': 'true' });
    eqv.textContent = '=';
    const input = el('input', 'graph-expr', {
      id: exprId, type: 'text', inputmode: 'text', maxlength: String(MAX_EXPR), autocomplete: 'off',
      autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'enter',
      placeholder: fn.slot === 1 ? 'e.g. x^2 - 4' : 'e.g. 2*x + 1', 'aria-describedby': `${id}-m${fn.slot}`,
    });
    input.value = fn.expr;
    main.append(name, eqv, input);

    const out = el('div', 'graph-fn-out');
    if (fn.given) {
      li.classList.add('is-given');
      const g = el('span', 'calc-given graph-given', { title: 'Given in the question. Edit it to keep it for later questions.' });
      g.textContent = fn.label ? `given · ${fn.label}` : 'given';
      out.appendChild(g);
      const sr = el('span', 'sr-only graph-given-sr');
      sr.textContent = ' (given in the question)';
      name.appendChild(sr);
    }
    const msg = el('p', 'graph-fn-msg', { id: `${id}-m${fn.slot}` });
    const eye = el('button', 'btn btn-small graph-eye', { type: 'button', 'aria-pressed': fn.hidden ? 'false' : 'true' });
    setEye(eye, fn);
    const pts = withIcon(el('button', 'btn btn-small graph-pts-btn', { type: 'button', 'aria-pressed': pointsFor === fn.slot ? 'true' : 'false', 'aria-label': `Key points of ${fnName(fn.slot)}` }), 'crosshair', 'Points');
    const del = withIcon(el('button', 'btn btn-small calc-del graph-del', { type: 'button', 'aria-label': `Delete ${fnName(fn.slot)}` }), 'trash-2');
    out.append(msg, eye, pts, del);
    li.append(main, out);
    return li;
  }

  function setEye(btn, fn) {
    btn.innerHTML = icon(fn.hidden ? 'eye-off' : 'eye');
    btn.setAttribute('aria-pressed', fn.hidden ? 'false' : 'true');
    btn.setAttribute('aria-label', `Show ${fnName(fn.slot)} on the graph`);
    btn.title = fn.hidden ? `${fnName(fn.slot)} is hidden` : `${fnName(fn.slot)} is shown`;
  }

  function renderFns() {
    fnList.textContent = '';
    notes.clear();
    fns.forEach(fn => fnList.appendChild(buildFn(fn)));
    addBtn.disabled = fns.length >= MAX_FNS;
    prepareAll();
  }

  function addFn(focus = true) {
    if (fns.length >= MAX_FNS) { setStatus(`The graph holds at most ${MAX_FNS} functions.`); return; }
    let slot = 1;
    while (fnBySlot(slot)) slot++;
    fns.push({ slot, expr: '', hidden: false });
    fns.sort((a, b) => a.slot - b.slot);
    setStatus('');
    renderFns();
    persist();
    scheduleDraw();
    if (focus) fnList.querySelector(`li[data-slot="${slot}"] .graph-expr`)?.focus();
  }

  function deleteFn(slot) {
    const i = fns.findIndex(f => f.slot === slot);
    if (i < 0) return;
    fns.splice(i, 1);
    if (!fns.length) fns.push({ slot: 1, expr: '', hidden: false });
    if (trace && trace.slot === slot) trace = null;
    if (pointsFor === slot) closePoints();
    setStatus('');
    renderFns();
    persist();
    refreshPointsSoon(0);
    scheduleDraw();
    const next = fns[Math.min(i, fns.length - 1)];
    fnList.querySelector(`li[data-slot="${next.slot}"] .graph-expr`)?.focus();
  }

  fnList.addEventListener('input', e => {
    if (!e.target.classList.contains('graph-expr')) return;
    const slot = Number(e.target.closest('.graph-fn')?.dataset.slot);
    const fn = fnBySlot(slot);
    if (!fn) return;
    fn.expr = e.target.value.slice(0, MAX_EXPR);
    if (fn.given) {
      // Editing a given function makes it the user's own: it stays when the next question comes.
      delete fn.given;
      delete fn.label;
      const li = e.target.closest('.graph-fn');
      li.classList.remove('is-given');
      li.querySelector('.graph-given')?.remove();
      li.querySelector('.graph-given-sr')?.remove();
    }
    setNote(slot, '');
    prepareAll();
    persist();
    refreshPointsSoon();
    scheduleDraw();
  });

  fnList.addEventListener('focusin', e => {
    const slot = Number(e.target.closest?.('.graph-fn')?.dataset.slot);
    if (slot) lastFocusedSlot = slot;
  });

  // Enter: next function, or a new one from the last. (calculator.js keeps Enter away from the quiz.)
  fnList.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || !e.target.classList.contains('graph-expr')) return;
    e.preventDefault();
    const slot = Number(e.target.closest('.graph-fn')?.dataset.slot);
    const i = fns.findIndex(f => f.slot === slot);
    if (i < 0) return;
    if (i === fns.length - 1) addFn(true);
    else fnList.querySelector(`li[data-slot="${fns[i + 1].slot}"] .graph-expr`)?.focus();
  });

  fnList.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const slot = Number(btn.closest('.graph-fn')?.dataset.slot);
    const fn = fnBySlot(slot);
    if (!fn) return;
    if (btn.classList.contains('graph-del')) deleteFn(slot);
    else if (btn.classList.contains('graph-eye')) {
      fn.hidden = !fn.hidden;
      btn.closest('.graph-fn').classList.toggle('is-hidden', fn.hidden);
      setEye(btn, fn);
      icons();
      if (fn.hidden && trace && trace.slot === slot) trace = null;
      persist();
      refreshPointsSoon(0);
      scheduleDraw();
    } else if (btn.classList.contains('graph-pts-btn')) {
      if (pointsFor === slot) closePoints(); else openPoints(slot);
    }
  });

  addBtn.addEventListener('click', () => addFn(true));

  // ---- view ----
  function setView(v, { save = true } = {}) {
    view = clampView(v);
    if (save) persist();
    refreshPointsSoon();
    scheduleDraw();
  }

  function zoomAt(fx, fy, factor) {
    // fx, fy: 0..1 position inside the plot that stays put.
    const xs = (view.xmax - view.xmin) * factor;
    const ys = (view.ymax - view.ymin) * factor;
    if (xs < MIN_SPAN || ys < MIN_SPAN || xs > MAX_SPAN || ys > MAX_SPAN) return;
    const cx = view.xmin + fx * (view.xmax - view.xmin);
    const cy = view.ymax - fy * (view.ymax - view.ymin);
    setView({ xmin: cx - fx * xs, xmax: cx + (1 - fx) * xs, ymax: cy + fy * ys, ymin: cy - (1 - fy) * ys });
  }

  function pan(fx, fy) {
    const dx = (view.xmax - view.xmin) * fx;
    const dy = (view.ymax - view.ymin) * fy;
    setView({ xmin: view.xmin + dx, xmax: view.xmax + dx, ymin: view.ymin + dy, ymax: view.ymax + dy });
  }

  function fit() {
    const list = visibleSlots().map(s => prepared.get(s).f);
    if (!list.length) { setStatus('Nothing to fit: add a function first.'); return; }
    const r = fitY(list, view.xmin, view.xmax);
    if (!r) { setStatus('The curves have no values in this x range.'); return; }
    setStatus('');
    setView({ ...view, ymin: r.ymin, ymax: r.ymax });
  }

  zoomIn.addEventListener('click', () => zoomAt(0.5, 0.5, 1 / ZOOM));
  zoomOut.addEventListener('click', () => zoomAt(0.5, 0.5, ZOOM));
  resetBtn.addEventListener('click', () => { setStatus(''); setView(defaultView()); });
  fitBtn.addEventListener('click', fit);

  // ---- window fields ----
  function syncFields(force = false) {
    if (!win.open && !force) return;
    for (const k in fields) {
      if (document.activeElement === fields[k]) continue;
      const t = String(Number(view[k].toPrecision(6)));
      if (fields[k].value !== t) fields[k].value = t;
    }
  }

  function applyWindow() {
    const v = {};
    const names = { xmin: 'x min', xmax: 'x max', ymin: 'y min', ymax: 'y max' };
    let problem = '';
    for (const k in fields) {
      const s = fields[k].value.trim();
      fields[k].setAttribute('aria-invalid', 'false');
      if (problem) continue;
      if (!s) { problem = `${names[k]}: enter a number`; fields[k].setAttribute('aria-invalid', 'true'); continue; }
      try { v[k] = calc(s); } catch (e) {
        problem = `${names[k]}: ${e instanceof CalcError ? e.message : 'not a number'}`;
        fields[k].setAttribute('aria-invalid', 'true');
      }
    }
    if (!problem) {
      for (const [a, b, label] of [['xmin', 'xmax', 'x'], ['ymin', 'ymax', 'y']]) {
        if (problem) break;
        if (!(v[a] < v[b])) { problem = `${label} min must be less than ${label} max`; fields[a].setAttribute('aria-invalid', 'true'); }
        else if (v[b] - v[a] < MIN_SPAN) problem = `${label} range is too small (at least ${MIN_SPAN})`;
        else if (v[b] - v[a] > MAX_SPAN || Math.abs(v[a]) > MAX_SPAN || Math.abs(v[b]) > MAX_SPAN) problem = `${label} range is too large (at most ${fmt(MAX_SPAN)})`;
      }
    }
    winErr.textContent = problem;
    winErr.hidden = !problem;
    if (problem) return;
    setView(v);
    syncFields(true);
  }

  win.addEventListener('toggle', () => { if (win.open) syncFields(true); });
  winApply.addEventListener('click', applyWindow);
  winGrid.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    applyWindow();
  });

  // ---- key points ----
  function closePoints() {
    pointsFor = null;
    points = null;
    pointsBox.hidden = true;
    pointsBox.textContent = '';
    fnList.querySelectorAll('.graph-pts-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
    scheduleDraw();
  }

  function openPoints(slot) {
    pointsFor = slot;
    fnList.querySelectorAll('.graph-pts-btn').forEach(b => b.setAttribute('aria-pressed', Number(b.closest('.graph-fn').dataset.slot) === slot ? 'true' : 'false'));
    computePoints();
  }

  function refreshPointsSoon(delay = 250) {
    if (pointsFor === null) return;
    clearTimeout(pointsTimer);
    pointsTimer = setTimeout(computePoints, delay);
  }

  function computePoints() {
    clearTimeout(pointsTimer);
    if (pointsFor === null) return;
    const fn = fnBySlot(pointsFor);
    const p = fn && prepared.get(fn.slot);
    if (!fn) { closePoints(); return; }
    if (!p || !p.f || fn.hidden) {
      points = { slot: fn.slot, unavailable: fn.hidden ? `${fnName(fn.slot)} is hidden.` : p?.error ? `${fnName(fn.slot)} has an error.` : `${fnName(fn.slot)} is empty.` };
    } else {
      const { xmin, xmax, ymin, ymax } = view;
      const zeros = findZeros(p.f, xmin, xmax, 800, MAX_POINTS + 1);
      const ext = findExtrema(p.f, xmin, xmax, 800, ymax - ymin, MAX_POINTS + 1);
      const inter = visibleSlots().filter(s => s !== fn.slot)
        .map(s => ({ slot: s, pts: findIntersections(p.f, prepared.get(s).f, xmin, xmax, 800, MAX_POINTS + 1) }));
      points = { slot: fn.slot, zeros, minima: ext.minima, maxima: ext.maxima, inter };
    }
    renderPoints();
    scheduleDraw();
  }

  function pointItem(pt, kind) {
    const li = el('li', 'graph-pt');
    const t = el('span', 'graph-pt-text');
    const xs = fmt(pt.x);
    const ys = fmt(pt.y);
    t.textContent = kind === 'zero' ? `x = ${xs}` : `x = ${xs}, y = ${ys}`;
    const btns = el('span', 'graph-pt-btns');
    const addX = el('button', 'btn btn-small btn-soft graph-pt-add', { type: 'button', 'aria-label': `Add x = ${xs} to the sheet` });
    addX.textContent = 'Add x';
    addX.dataset.value = String(pt.x);
    btns.appendChild(addX);
    if (kind !== 'zero') {
      const addY = el('button', 'btn btn-small btn-soft graph-pt-add', { type: 'button', 'aria-label': `Add y = ${ys} to the sheet` });
      addY.textContent = 'Add y';
      addY.dataset.value = String(pt.y);
      btns.appendChild(addY);
    }
    li.append(t, btns);
    return li;
  }

  function renderPoints() {
    pointsBox.textContent = '';
    if (!points) { pointsBox.hidden = true; return; }
    pointsBox.hidden = false;
    const head = el('div', 'graph-points-head');
    const h = el('h3', 'graph-points-title', { id: `${id}-pts-title` });
    h.textContent = `Key points of ${fnName(points.slot)}`;
    const sub = el('span', 'graph-points-sub');
    sub.textContent = 'in this view';
    h.append(' ', sub);
    const close = withIcon(el('button', 'btn btn-small graph-points-close', { type: 'button', 'aria-label': 'Close key points' }), 'x');
    close.addEventListener('click', () => { const s = pointsFor; closePoints(); fnList.querySelector(`li[data-slot="${s}"] .graph-pts-btn`)?.focus(); });
    head.append(h, close);
    pointsBox.appendChild(head);
    if (points.unavailable) {
      const p = el('p', 'graph-points-empty');
      p.textContent = points.unavailable;
      pointsBox.appendChild(p);
      icons();
      return;
    }
    const groups = [
      ['Zeros', points.zeros, 'zero'],
      ['Minima', points.minima, 'pt'],
      ['Maxima', points.maxima, 'pt'],
      ...points.inter.map(g => [`Intersections with ${fnName(g.slot)}`, g.pts, 'pt']),
    ];
    for (const [title, list, kind] of groups) {
      const g = el('div', 'graph-pt-group');
      const h4 = el('h4');
      h4.textContent = title;
      g.appendChild(h4);
      if (!list.length) {
        const p = el('p', 'graph-points-empty');
        p.textContent = 'None in this view.';
        g.appendChild(p);
      } else {
        const ul = el('ul', 'graph-pt-list');
        list.slice(0, MAX_POINTS).forEach(pt => ul.appendChild(pointItem(pt, kind)));
        g.appendChild(ul);
        if (list.length > MAX_POINTS) {
          const p = el('p', 'graph-points-empty');
          p.textContent = `Showing the first ${MAX_POINTS}. Zoom in to see the rest.`;
          g.appendChild(p);
        }
      }
      pointsBox.appendChild(g);
    }
    icons();
  }

  pointsBox.addEventListener('click', e => {
    const btn = e.target.closest('.graph-pt-add');
    if (!btn) return;
    const v = Number(btn.dataset.value);
    if (!Number.isFinite(v) || typeof onAddValue !== 'function') return;
    const r = onAddValue(v);
    setStatus(r && r.ok ? `Added ${r.label} = ${r.expr} to the sheet.` : (r && r.message) || 'Could not add the value.');
  });

  // ---- drawing ----
  const isPhone = () => !!window.matchMedia?.(PHONE).matches;

  function resize() {
    const w = plot.clientWidth;
    if (!w) { cssW = 0; return; }
    let h = Math.round(w * 0.75);
    if (tall) h = Math.round(Math.min(h, Math.max(220, window.innerHeight * 0.6)));
    else if (isPhone()) h = Math.round(Math.min(h, Math.max(150, window.innerHeight * 0.3)));
    const d = window.devicePixelRatio || 1;
    if (w === cssW && h === cssH && d === dpr) return;
    cssW = w; cssH = h; dpr = d;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    scheduleDraw();
  }

  function scheduleDraw() {
    if (raf || !active) return;
    raf = requestAnimationFrame(draw);
  }

  const toPx = x => ((x - view.xmin) / (view.xmax - view.xmin)) * cssW;
  const toPy = y => ((view.ymax - y) / (view.ymax - view.ymin)) * cssH;

  function draw() {
    raf = 0;
    if (!active || !cssW || !cssH) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = plotColors(root);
    const W = cssW;
    const H = cssH;
    const { empty } = paintPlot(ctx, {
      W, H, dpr, view, c, font: getComputedStyle(root).fontFamily,
      curves: fns.filter(fn => !fn.hidden && prepared.get(fn.slot)?.f).map(fn => ({ slot: fn.slot, f: prepared.get(fn.slot).f })),
    });
    for (const fn of fns) {
      if (!fn.hidden && prepared.get(fn.slot)?.f) setNote(fn.slot, empty.has(fn.slot) ? 'No values in this view.' : '');
    }

    // key points of the selected function
    if (points && !points.unavailable) {
      const color = c.fns[points.slot - 1];
      const all = [...points.zeros, ...points.minima, ...points.maxima, ...points.inter.flatMap(g => g.pts)];
      ctx.lineWidth = 2;
      all.slice(0, 60).forEach(pt => {
        const px = toPx(pt.x);
        const py = toPy(pt.y);
        if (px < -6 || px > W + 6 || py < -6 || py > H + 6) return;
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = c.bg;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.stroke();
      });
    }

    drawTrace(ctx, c);
    syncFields();
  }

  function traceValue() {
    if (!trace) return null;
    const fn = fnBySlot(trace.slot);
    const p = fn && prepared.get(fn.slot);
    if (!fn || fn.hidden || !p || !p.f) return null;
    return p.f(trace.x);
  }

  function drawTrace(ctx, c) {
    let text = readoutMsg;
    if (trace) {
      const y = traceValue();
      const name = fnName(trace.slot);
      if (y === null) { trace = null; }
      else if (!Number.isFinite(y)) text = `${name}: x = ${fmt(trace.x)}, no value here`;
      else {
        text = `${name}: x = ${fmt(trace.x)}, y = ${fmt(y)}`;
        const px = toPx(trace.x);
        const py = toPy(y);
        if (px >= -6 && px <= cssW + 6 && py >= -6 && py <= cssH + 6) {
          const color = c.fns[trace.slot - 1];
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(px) + 0.5, 0); ctx.lineTo(Math.round(px) + 0.5, cssH);
          ctx.moveTo(0, Math.round(py) + 0.5); ctx.lineTo(cssW, Math.round(py) + 0.5);
          ctx.stroke();
          ctx.restore();
          ctx.beginPath();
          ctx.arc(px, py, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = c.bg;
          ctx.stroke();
        }
      }
    }
    if (text !== readoutText) {
      readoutText = text;
      readout.textContent = text;
    }
  }

  // Trace the visible curve closest to (px, py) at that x.
  function traceAt(px, py) {
    const unitsPerPx = (view.xmax - view.xmin) / cssW;
    const x = roundToPixel(view.xmin + (px / cssW) * (view.xmax - view.xmin), unitsPerPx);
    let best = null;
    for (const slot of visibleSlots()) {
      const y = prepared.get(slot).f(x);
      if (!Number.isFinite(y)) continue;
      const d = Math.abs(toPy(y) - py);
      if (!best || d < best.d) best = { slot, d };
    }
    if (!best) {
      trace = null;
      readoutMsg = visibleSlots().length ? `No curve has a value at x = ${fmt(x)}.` : 'Add a function to trace it.';
      scheduleDraw();
      return;
    }
    readoutMsg = '';
    trace = { slot: best.slot, x };
    scheduleDraw();
  }

  function moveTrace(dir) {
    const slots = visibleSlots();
    if (!slots.length) return;
    readoutMsg = '';
    const step = niceStep(view.xmax - view.xmin, 100);
    if (!trace || !slots.includes(trace.slot)) {
      const x = Number((Math.round((view.xmin + view.xmax) / 2 / step) * step).toPrecision(12));
      trace = { slot: slots[0], x };
    } else {
      trace.x = Number(((Math.round(trace.x / step) + dir) * step).toPrecision(12));
      if (Object.is(trace.x, -0)) trace.x = 0;
      const span = view.xmax - view.xmin;
      if (trace.x < view.xmin || trace.x > view.xmax) {
        const shift = trace.x < view.xmin ? trace.x - view.xmin - span * 0.1 : trace.x - view.xmax + span * 0.1;
        setView({ ...view, xmin: view.xmin + shift, xmax: view.xmax + shift });
      }
    }
    scheduleDraw();
  }

  // ---- pointer / wheel / keyboard ----
  const pointers = new Map();
  let drag = null; // { x, y, view, moved }
  let pinch = null; // { dist, view, mx, my } (mx/my: data point under the midpoint)

  const localPos = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch = {
      dist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
      view: { ...view },
      mx: view.xmin + (mid.x / cssW) * (view.xmax - view.xmin),
      my: view.ymax - (mid.y / cssH) * (view.ymax - view.ymin),
    };
    drag = null;
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pointers.set(e.pointerId, localPos(e));
    if (pointers.size === 1) {
      const p = localPos(e);
      drag = { x: p.x, y: p.y, view: { ...view }, moved: false };
    } else if (pointers.size === 2) startPinch();
  });

  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, localPos(e));
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = pinch.dist / dist;
      const xs = (pinch.view.xmax - pinch.view.xmin) * k;
      const ys = (pinch.view.ymax - pinch.view.ymin) * k;
      if (xs < MIN_SPAN || ys < MIN_SPAN || xs > MAX_SPAN || ys > MAX_SPAN) return;
      const xmin = pinch.mx - (mid.x / cssW) * xs;
      const ymax = pinch.my + (mid.y / cssH) * ys;
      setView({ xmin, xmax: xmin + xs, ymin: ymax - ys, ymax }, { save: false });
      return;
    }
    if (!drag) return;
    const p = localPos(e);
    const dxp = p.x - drag.x;
    const dyp = p.y - drag.y;
    if (!drag.moved && Math.hypot(dxp, dyp) < 5) return;
    drag.moved = true;
    const dx = (dxp / cssW) * (drag.view.xmax - drag.view.xmin);
    const dy = (dyp / cssH) * (drag.view.ymax - drag.view.ymin);
    setView({ xmin: drag.view.xmin - dx, xmax: drag.view.xmax - dx, ymin: drag.view.ymin + dy, ymax: drag.view.ymax + dy }, { save: false });
  });

  function endPointer(e, cancelled) {
    if (!pointers.has(e.pointerId)) return;
    const p = localPos(e);
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) {
        pinch = null;
        const rest = [...pointers.values()][0];
        drag = rest ? { x: rest.x, y: rest.y, view: { ...view }, moved: true } : null;
        persist();
      }
      return;
    }
    if (drag && !drag.moved && !cancelled) traceAt(p.x, p.y);
    else if (drag && drag.moved) persist();
    if (!pointers.size) drag = null;
  }
  canvas.addEventListener('pointerup', e => endPointer(e, false));
  canvas.addEventListener('pointercancel', e => endPointer(e, true));

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const p = localPos(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cssH : 1;
    const d = Math.max(-300, Math.min(300, e.deltaY * unit));
    if (!d) return;
    zoomAt(p.x / cssW, p.y / cssH, Math.exp(d * 0.0015));
  }, { passive: false });

  canvas.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let handled = true;
    // Fall back to the physical key when `key` is missing (some virtual keyboards / automation).
    const CODES = { NumpadAdd: '+', Equal: '=', NumpadSubtract: '-', Minus: '-', Digit0: '0', Numpad0: '0' };
    const key = e.key && e.key !== 'Unidentified' ? e.key : (CODES[e.code] || '');
    switch (key) {
      case 'ArrowLeft': if (e.shiftKey) moveTrace(-1); else pan(-0.1, 0); break;
      case 'ArrowRight': if (e.shiftKey) moveTrace(1); else pan(0.1, 0); break;
      case 'ArrowUp': if (e.shiftKey) handled = false; else pan(0, 0.1); break;
      case 'ArrowDown': if (e.shiftKey) handled = false; else pan(0, -0.1); break;
      case '+': case '=': zoomAt(0.5, 0.5, 1 / ZOOM); break;
      case '-': case '_': zoomAt(0.5, 0.5, ZOOM); break;
      case '0': setView(defaultView()); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  });

  // ---- resize / theme ----
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(plot);
  const onWinResize = () => resize();
  window.addEventListener('resize', onWinResize);
  const darkMq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const onTheme = () => scheduleDraw();
  darkMq?.addEventListener?.('change', onTheme);
  // Theme / accent set on <html> (data-theme, style) also changes the canvas colours.
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(onTheme) : null;
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });

  renderFns();

  return {
    // A sheet label was renamed: rewrite whole-token references in the function expressions
    // (same rule as the sheet, calc.renameLabel). The caller re-plots via refresh().
    renameRef(oldName, newName) {
      const out = renameLabel(fns.map(f => ({ label: '', expr: f.expr })), oldName, newName);
      fns.forEach((f, i) => {
        const expr = String(out[i].expr).slice(0, MAX_EXPR);
        if (expr === f.expr) return;
        f.expr = expr;
        const input = fnList.querySelector(`li[data-slot="${f.slot}"] .graph-expr`);
        if (input && input.value !== expr) input.value = expr;
      });
    },
    // The sheet changed: re-resolve _row references and redraw.
    refresh() {
      prepareAll();
      refreshPointsSoon();
      scheduleDraw();
    },
    setActive(v) {
      active = !!v;
      if (active) {
        resize();
        prepareAll();
        if (pointsFor !== null) computePoints();
        scheduleDraw();
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    focus() {
      const target = (lastFocusedSlot && fnList.querySelector(`li[data-slot="${lastFocusedSlot}"] .graph-expr`))
        || fnList.querySelector('.graph-expr');
      target?.focus();
    },
    // Full state for the calculator's own storage (keeps the given flags).
    getState() {
      return {
        fns: fns.map(f => ({ slot: f.slot, expr: f.expr, hidden: f.hidden, ...(f.given ? { given: true } : {}), ...(f.label ? { label: f.label } : {}) })),
        view: { ...view },
      };
    },
    // What is saved with an answer: the non-empty functions and the view, or null.
    snapshot() {
      const list = fns.filter(f => f.expr.trim()).map(f => ({ slot: f.slot, expr: f.expr, hidden: f.hidden }));
      return list.length ? { fns: list, view: { ...view } } : null;
    },
    hasGiven: () => fns.some(f => f.given),
    // Replace the untouched given functions of the previous question with these (may be empty).
    // list: [{ expr, label? }] (already validated by the engine); givenView: a view or null.
    setGiven(list, givenView) {
      const fresh = (Array.isArray(list) ? list : [])
        .filter(g => g && typeof g.expr === 'string' && g.expr.trim()).slice(0, GIVEN_FNS_MAX);
      const gv = givenView && validView(givenView) ? clampView(givenView) : null;
      const had = fns.some(f => f.given);
      if (!had && !fresh.length && !gv) return;
      // Blank functions give way to given ones, so these take y1, y2, … where free.
      let kept = fns.filter(f => !f.given);
      if (fresh.length) kept = kept.filter(f => f.expr.trim());
      const used = new Set(kept.map(f => f.slot));
      const added = [];
      for (const g of fresh) {
        if (kept.length + added.length >= MAX_FNS) break;
        let slot = 1;
        while (used.has(slot)) slot++;
        used.add(slot);
        const label = typeof g.label === 'string' ? g.label.trim().slice(0, GIVEN_LABEL_MAX) : '';
        added.push({ slot, expr: g.expr.slice(0, MAX_EXPR), hidden: false, given: true, ...(label ? { label } : {}) });
      }
      fns = [...kept, ...added].sort((a, b) => a.slot - b.slot);
      if (!fns.length) fns = [{ slot: 1, expr: '', hidden: false }];
      if (trace && !fnBySlot(trace.slot)) trace = null;
      if (pointsFor !== null && !fnBySlot(pointsFor)) closePoints();
      // A question's window applies while it is shown; the earlier one comes back after it,
      // unless the user moved the view in the meantime.
      const same = (a, b) => a && b && ['xmin', 'xmax', 'ymin', 'ymax'].every(k => a[k] === b[k]);
      if (gv) {
        viewBeforeGiven = { before: viewBeforeGiven && same(view, viewBeforeGiven.applied) ? viewBeforeGiven.before : { ...view }, applied: gv };
        view = gv;
      } else if (viewBeforeGiven) {
        if (same(view, viewBeforeGiven.applied)) view = clampView(viewBeforeGiven.before);
        viewBeforeGiven = null;
      }
      setStatus('');
      renderFns();
      persist();
      refreshPointsSoon(0);
      scheduleDraw();
    },
    // Back to one empty y1 and the default window.
    reset() {
      fns = [{ slot: 1, expr: '', hidden: false }];
      view = defaultView();
      trace = null;
      readoutMsg = '';
      viewBeforeGiven = null;
      closePoints();
      setStatus('');
      win.open = false;
      winErr.hidden = true;
      renderFns();
      persist();
      scheduleDraw();
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(pointsTimer);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('resize', onWinResize);
      darkMq?.removeEventListener?.('change', onTheme);
      root.remove();
    },
  };
}
