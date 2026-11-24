// Graphing maths for the calculator's Graph mode. Pure module (no DOM).
//
// Every function takes plain numeric callbacks f(x) -> number, which return NaN where the
// expression can't be evaluated (domain errors, division by zero, …). Nothing here throws.
//
//   niceStep(span, target)               1/2/5×10^n tick step giving about `target` ticks
//   ticks(min, max, step)                tick values inside [min, max]
//   formatTick(v, step)                  tick label without float noise
//   roundToPixel(x, unitsPerPx)          a traced x rounded to what one pixel can resolve
//   sampleCurve(f, x0, x1, n, jump)      { xs, ys, brk } for drawing (brk[i]: don't join i-1 -> i)
//   findZeros / findExtrema / findIntersections   key points inside [x0, x1]
//   fitY(fs, x0, x1)                     a y-range that shows the curves, ignoring outliers
//   clampView / defaultView / validView  view-window helpers

export const DEFAULT_VIEW = Object.freeze({ xmin: -10, xmax: 10, ymin: -10, ymax: 10 });
export const MIN_SPAN = 1e-6;
export const MAX_SPAN = 1e9;
export const MAX_ABS = 1e9;
export const MAX_POINTS = 10;

const fin = Number.isFinite;

export function defaultView() {
  return { ...DEFAULT_VIEW };
}

// A view object is usable: four finite numbers, min < max, spans and centre within limits.
export function validView(v) {
  if (!v || typeof v !== 'object') return false;
  const { xmin, xmax, ymin, ymax } = v;
  if (![xmin, xmax, ymin, ymax].every(n => typeof n === 'number' && fin(n))) return false;
  if (!(xmin < xmax && ymin < ymax)) return false;
  const ok = (a, b) => b - a >= MIN_SPAN * 0.999 && b - a <= MAX_SPAN * 1.001 && Math.abs(a) <= MAX_ABS * 2 && Math.abs(b) <= MAX_ABS * 2;
  return ok(xmin, xmax) && ok(ymin, ymax);
}

// Keeps one axis' range within the span/centre limits (preserving the centre where possible).
function clampAxis(lo, hi) {
  let c = (lo + hi) / 2;
  let s = hi - lo;
  if (!fin(c) || !fin(s) || s <= 0) return [-10, 10];
  s = Math.min(MAX_SPAN, Math.max(MIN_SPAN, s));
  c = Math.min(MAX_ABS, Math.max(-MAX_ABS, c));
  return [c - s / 2, c + s / 2];
}

export function clampView(v) {
  const [xmin, xmax] = clampAxis(v.xmin, v.xmax);
  const [ymin, ymax] = clampAxis(v.ymin, v.ymax);
  return { xmin, xmax, ymin, ymax };
}

// ---------- ticks ----------

export function niceStep(span, target = 8) {
  if (!(span > 0) || !fin(span)) return 1;
  const raw = span / Math.max(1, target);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const k = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return k * p;
}

export function ticks(min, max, step) {
  const out = [];
  if (!(step > 0) || !fin(min) || !fin(max)) return out;
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  if (last - first > 500) return out;
  for (let k = first; k <= last; k++) out.push(k * step);
  return out;
}

function decimalsFor(step) {
  return Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
}

export function formatTick(v, step) {
  if (!fin(v)) return '';
  if (Math.abs(v) < step * 1e-6) return '0';
  const d = decimalsFor(step);
  if (d > 7 || Math.abs(v) >= 1e7) {
    const s = String(Number(v.toPrecision(6)));
    return s === '-0' ? '0' : s;
  }
  const s = v.toFixed(d);
  return /^-0(\.0*)?$/.test(s) ? '0' : s;
}

// A traced x rounded to the resolution of one pixel (so the readout says 2, not 2.0137…).
export function roundToPixel(x, unitsPerPx) {
  if (!fin(x)) return x;
  if (!(unitsPerPx > 0)) return x;
  const q = Math.pow(10, Math.floor(Math.log10(unitsPerPx)));
  const r = Math.round(x / q) * q;
  const d = Math.max(0, -Math.floor(Math.log10(q)));
  const v = d <= 15 ? Number(r.toFixed(d)) : r;
  return Object.is(v, -0) ? 0 : v;
}

// ---------- sampling ----------

function sample(f, x0, x1, n) {
  const xs = new Float64Array(n + 1);
  const ys = new Float64Array(n + 1);
  const dx = (x1 - x0) / n;
  for (let i = 0; i <= n; i++) {
    const x = i === n ? x1 : x0 + i * dx;
    xs[i] = x;
    const y = f(x);
    ys[i] = fin(y) ? y : NaN;
  }
  return { xs, ys };
}

// Two finite neighbouring samples belong to one continuous piece of the curve, unless they're
// more than `jump` apart and the value halfway between isn't between them (an asymptote such as
// tan(x) at 90 or 1/x at 0, rather than a steep slope).
function joined(f, xa, ya, xb, yb, jump) {
  if (!(Math.abs(yb - ya) > jump)) return true;
  const m = f((xa + xb) / 2);
  if (!fin(m)) return false;
  const lo = Math.min(ya, yb);
  const hi = Math.max(ya, yb);
  const slack = (hi - lo) * 1e-9;
  return m >= lo - slack && m <= hi + slack;
}

// Samples for drawing. brk[i] = 1 means "start a new piece at i".
export function sampleCurve(f, x0, x1, n, jump) {
  const { xs, ys } = sample(f, x0, x1, n);
  const brk = new Uint8Array(n + 1);
  for (let i = 0; i <= n; i++) {
    if (!fin(ys[i])) { brk[i] = 1; continue; }
    if (i === 0 || !fin(ys[i - 1])) { brk[i] = 1; continue; }
    if (!joined(f, xs[i - 1], ys[i - 1], xs[i], ys[i], jump)) brk[i] = 1;
  }
  return { xs, ys, brk };
}

// ---------- refinement helpers ----------

function bisect(f, a, b, fa) {
  let lo = a;
  let hi = b;
  let flo = fa;
  for (let k = 0; k < 200; k++) {
    const m = (lo + hi) / 2;
    if (m === lo || m === hi) break;
    const fm = f(m);
    if (!fin(fm)) return NaN;
    if (fm === 0) return m;
    if ((fm < 0) === (flo < 0)) { lo = m; flo = fm; } else hi = m;
  }
  return Math.abs(f(lo)) <= Math.abs(f(hi)) ? lo : hi;
}

// Minimises g on [a, b] (golden-section search).
function goldenMin(g, a, b) {
  const R = (Math.sqrt(5) - 1) / 2;
  let c = b - R * (b - a);
  let d = a + R * (b - a);
  let gc = g(c);
  let gd = g(d);
  for (let k = 0; k < 200; k++) {
    if (Math.abs(b - a) <= 1e-13 * (Math.abs(a) + Math.abs(b)) + 1e-300) break;
    if (!(gd < gc)) { b = d; d = c; gd = gc; c = b - R * (b - a); gc = g(c); }
    else { a = c; c = d; gc = gd; d = a + R * (b - a); gd = g(d); }
  }
  return (a + b) / 2;
}

// Nudges a refined x onto a short decimal (0 instead of 1e-9, 180 instead of 179.9999998) when
// that's no worse by `bad` (smaller = better) and very close to x.
function snapX(x, span, bad) {
  if (!fin(x)) return x;
  const b0 = bad(x);
  const tol = Math.max(span * 1e-6, 1e-300);
  const top = Math.floor(Math.log10(Math.max(span, 1e-300)));
  for (let k = 1; k <= 12; k++) {
    const q = Math.pow(10, top - k);
    let xr = Math.round(x / q) * q;
    xr = Number(xr.toPrecision(12));
    if (Object.is(xr, -0)) xr = 0;
    if (Math.abs(xr - x) > tol) continue;
    const br = bad(xr);
    if (fin(br) && br <= b0 + 1e-12 * (1 + Math.abs(b0))) return xr;
  }
  return x;
}

function dedupe(points, minGap) {
  points.sort((p, q) => p.x - q.x);
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(p.x - last.x) <= minGap) continue;
    out.push(p);
  }
  return out;
}

const cleanY = y => (Math.abs(y) < 1e-12 ? 0 : y);

// ---------- key points ----------

// Zeros of f in [x0, x1]: sign changes (bisection) plus touching zeros (local minima of |f| at 0).
// Returns [{ x, y }] (y is 0 or nearly so), at most `max`.
export function findZeros(f, x0, x1, n = 800, max = MAX_POINTS) {
  const { xs, ys } = sample(f, x0, x1, n);
  const span = x1 - x0;
  const found = [];
  for (let i = 0; i <= n; i++) {
    const y = ys[i];
    if (y === 0) { found.push(xs[i]); continue; }
    if (i > 0) {
      const ya = ys[i - 1];
      if (fin(ya) && fin(y) && ya !== 0 && (ya < 0) !== (y < 0)) {
        const r = bisect(f, xs[i - 1], xs[i], ya);
        const fr = f(r);
        // A real crossing ends near 0; an asymptote (tan, 1/x) or a jump doesn't.
        if (fin(fr) && Math.abs(fr) <= 1e-6 * Math.max(Math.abs(ya), Math.abs(y))) found.push(r);
      }
    }
    if (i > 0 && i < n) {
      const ya = ys[i - 1];
      const yb = ys[i + 1];
      if (fin(ya) && fin(yb) && fin(y) && ya !== 0 && yb !== 0 && (ya < 0) === (y < 0) && (yb < 0) === (y < 0)
          && Math.abs(y) <= Math.abs(ya) && Math.abs(y) < Math.abs(yb)) {
        const g = x => { const v = f(x); return fin(v) ? Math.abs(v) : Infinity; };
        const xm = goldenMin(g, xs[i - 1], xs[i + 1]);
        const scale = Math.max(Math.abs(ya), Math.abs(yb));
        if (g(xm) <= 1e-9 * scale) found.push(xm);
      }
    }
  }
  const pts = found.map(x => {
    const xs2 = snapX(x, span, t => { const v = f(t); return fin(v) ? Math.abs(v) : Infinity; });
    return { x: xs2, y: cleanY(f(xs2)) };
  }).filter(p => fin(p.y) && p.x >= x0 && p.x <= x1);
  return dedupe(pts, (span / n) * 0.75).slice(0, max);
}

// Local minima and maxima inside (x0, x1). `jump` = a y-distance treated as a possible
// discontinuity (usually the view height). Returns { minima: [{x, y}], maxima: [{x, y}] }.
export function findExtrema(f, x0, x1, n = 800, jump = Infinity, max = MAX_POINTS) {
  const { xs, ys } = sample(f, x0, x1, n);
  const span = x1 - x0;
  const minima = [];
  const maxima = [];
  for (let i = 1; i < n; i++) {
    const a = ys[i - 1];
    const b = ys[i];
    const c = ys[i + 1];
    if (!fin(a) || !fin(b) || !fin(c)) continue;
    const isMax = b > a && b > c;
    const isMin = b < a && b < c;
    if (!isMax && !isMin) continue;
    if (!joined(f, xs[i - 1], a, xs[i], b, jump) || !joined(f, xs[i], b, xs[i + 1], c, jump)) continue;
    const sgn = isMax ? -1 : 1;
    const g = x => { const v = f(x); return fin(v) ? sgn * v : Infinity; };
    let xm = goldenMin(g, xs[i - 1], xs[i + 1]);
    if (!fin(g(xm))) continue;
    xm = snapX(xm, span, g);
    const ym = f(xm);
    if (!fin(ym)) continue;
    (isMax ? maxima : minima).push({ x: xm, y: cleanY(ym) });
  }
  const gap = (span / n) * 0.75;
  return { minima: dedupe(minima, gap).slice(0, max), maxima: dedupe(maxima, gap).slice(0, max) };
}

// Where f and g meet in [x0, x1]: zeros of f - g. Returns [{ x, y }] with y = f(x).
export function findIntersections(f, g, x0, x1, n = 800, max = MAX_POINTS) {
  const h = x => {
    const a = f(x);
    const b = g(x);
    return fin(a) && fin(b) ? a - b : NaN;
  };
  return findZeros(h, x0, x1, n, max)
    .map(p => ({ x: p.x, y: cleanY(f(p.x)) }))
    .filter(p => fin(p.y));
}

// A y-range that shows the given curves over [x0, x1]: the full range of values, trimmed to
// the interquartile range ± 3×IQR so asymptotes (tan, 1/x) don't flatten everything, plus padding.
// Returns { ymin, ymax } or null when no curve has a value in range.
export function fitY(fs, x0, x1, n = 400) {
  const vals = [];
  for (const f of fs) {
    const { ys } = sample(f, x0, x1, n);
    for (const y of ys) if (fin(y)) vals.push(y);
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const at = q => vals[Math.min(vals.length - 1, Math.max(0, Math.round(q * (vals.length - 1))))];
  const lo0 = vals[0];
  const hi0 = vals[vals.length - 1];
  const q1 = at(0.25);
  const q3 = at(0.75);
  const iqr = q3 - q1;
  let lo = iqr > 0 ? Math.max(lo0, q1 - 3 * iqr) : lo0;
  let hi = iqr > 0 ? Math.min(hi0, q3 + 3 * iqr) : hi0;
  if (hi - lo < 1e-9 * Math.max(1, Math.abs(hi), Math.abs(lo))) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08;
  const [ymin, ymax] = clampAxis(lo - pad, hi + pad);
  return { ymin, ymax };
}
