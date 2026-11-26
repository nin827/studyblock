// Static plots of a saved calculator graph (quiz review and History): `<sb-graph>`.
//
// The review HTML carries the stored graph and the working's values as escaped JSON attributes:
//   <sb-graph data-graph='{"fns":[{slot,expr,hidden}],"view":{…}}' data-work='[{label,value}]'>
// The element re-validates both (data only), parses each expression with calc.js (no eval) and
// redraws it with the live graph's painter. It is re-rendered from the functions, not an image, so
// it follows the theme and the element's width. Sheet references such as _a take the value the
// row had when the answer was checked (from the saved working).
//
// compileGraph(graph, work) -> [{ slot, expr, hidden, f } | { …, error }]   (also used for the list)

import { parse, evaluate, CalcError } from '../lib/calc.js';
import { cleanGraph, cleanWork } from '../lib/storage.js';
import { paintPlot, plotColors } from './graph.js';

function refNames(ast, out = []) {
  if (!ast) return out;
  if (ast.k === 'ref') out.push(ast.name);
  else if (ast.k === 'neg') refNames(ast.a, out);
  else if (ast.k === 'bin') { refNames(ast.a, out); refNames(ast.b, out); }
  else if (ast.k === 'call') ast.args.forEach(a => refNames(a, out));
  return out;
}

export function compileGraph(graph, work) {
  const g = cleanGraph(graph);
  if (!g) return [];
  const values = new Map();
  for (const r of cleanWork(work) || []) if (typeof r.value === 'number') values.set(r.label.toLowerCase(), r.value);
  return g.fns.map(fn => {
    let ast;
    try { ast = parse(fn.expr, { vars: ['x'] }); } catch (e) { return { ...fn, error: e instanceof CalcError ? e.message : 'could not read expression' }; }
    const missing = refNames(ast).find(n => !values.has(n.toLowerCase()));
    if (missing) return { ...fn, error: `unknown value: ${missing}` };
    const vars = { x: 0 };
    const refs = name => values.get(name);
    const f = x => {
      vars.x = x;
      try { return evaluate(ast, refs, vars); } catch { return NaN; }
    };
    return { ...fn, f };
  });
}

function readJSON(s) {
  try { return JSON.parse(s || 'null'); } catch { return null; }
}

const fmt = v => String(Number(v.toPrecision(6)));

if (typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined' && !customElements.get('sb-graph')) {
  customElements.define('sb-graph', class extends HTMLElement {
    connectedCallback() {
      if (this.canvas) { this.observe(); this.schedule(); return; }
      const g = cleanGraph(readJSON(this.getAttribute('data-graph')));
      if (!g) return;
      this.view = g.view;
      this.compiled = compileGraph(g, readJSON(this.getAttribute('data-work')));
      const shown = this.compiled.filter(c => !c.hidden);
      const v = this.view;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'static-graph-canvas';
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', `Graph of ${shown.length ? shown.map(c => `y${c.slot} = ${c.expr}`).join('; ') : 'no shown functions'}, for x from ${fmt(v.xmin)} to ${fmt(v.xmax)} and y from ${fmt(v.ymin)} to ${fmt(v.ymax)}`);
      this.appendChild(this.canvas);
      this.observe();
      this.schedule();
    }

    observe() {
      if (!this.ro && typeof ResizeObserver === 'function') {
        this.ro = new ResizeObserver(() => this.schedule());
        this.ro.observe(this);
      }
      if (!this.mo && typeof MutationObserver === 'function') {
        this.mo = new MutationObserver(() => this.schedule());
        this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
      }
      if (!this.mq && window.matchMedia) {
        this.mq = window.matchMedia('(prefers-color-scheme: dark)');
        this.onTheme = () => this.schedule();
        this.mq.addEventListener?.('change', this.onTheme);
      }
    }

    disconnectedCallback() {
      this.ro?.disconnect();
      this.mo?.disconnect();
      this.mq?.removeEventListener?.('change', this.onTheme);
      this.ro = this.mo = this.mq = null;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    schedule() {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
    }

    draw() {
      const canvas = this.canvas;
      const W = this.clientWidth;
      if (!canvas || !W) return; // closed <details>: drawn when it opens (ResizeObserver)
      const H = Math.round(Math.min(W * 0.6, 320));
      const dpr = window.devicePixelRatio || 1;
      canvas.style.height = `${H}px`;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      paintPlot(ctx, {
        W, H, dpr, view: this.view, c: plotColors(this), font: getComputedStyle(this).fontFamily,
        curves: this.compiled.filter(c => !c.hidden && c.f).map(c => ({ slot: c.slot, f: c.f })),
      });
    }
  });
}
