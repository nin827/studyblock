// Calculator widget: a small live worksheet of named rows (see "Calculator with stored values"
// in CLAUDE.md). The maths lives in js/lib/calc.js; this file is DOM only.
//
// mountCalculator(container, { onUse(valueString), onEscape(), storageKey, owner })
//   -> { setVisible(bool), snapshot(), clear(), destroy({ forget }), focus(), setUseEnabled(bool, hint),
//        setGiven([{ label, value }]) }
//
// Given values: setGiven() drops the rows still flagged `given` (untouched pre-filled rows from the
// previous question) and inserts the new ones at the top. Editing a given row's label or expression
// clears its flag, so it stays like any other row. The flag is kept in sessionStorage too.
//
// All user text goes into the page through textContent / attributes, never innerHTML.

import { evaluateSheet, nextLabel, renameLabel, formatValue, labelProblem, normalizeLabel, MAX_ROWS, MAX_EXPR, LABEL_RE } from '../lib/calc.js';
import { icon, icons } from './ui.js';

const DEFAULT_KEY = 'studyblock:calc';
const GIVEN_MAX = 8;
let uid = 0;

// A given value as a compact expression: up to 12 significant digits, no float noise (0.1, not 0.1000000000000000055).
export function givenExpr(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  if (v === 0) return '0';
  const r = Number(v.toPrecision(12));
  return String(r === 0 ? 0 : r);
}

// `label` made unique (ignoring case) against `used` (a Set of lower-cased labels) with _2, _3, ...
function uniqueLabel(label, used) {
  if (!used.has(label.toLowerCase())) return label;
  for (let n = 2; n < 1000; n++) {
    const suffix = `_${n}`;
    const cand = label.slice(0, 24 - suffix.length) + suffix;
    if (!LABEL_RE.test(cand)) continue;
    if (!used.has(cand.toLowerCase())) return cand;
  }
  return null;
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

function readStore(key, owner) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || !Array.isArray(v.rows)) return null;
    if (String(v.owner ?? '') !== String(owner ?? '')) return null;
    const rows = v.rows.slice(0, MAX_ROWS)
      .filter(r => r && typeof r === 'object' && typeof r.label === 'string' && typeof r.expr === 'string')
      .map(r => ({ label: r.label.slice(0, 24), expr: r.expr.slice(0, MAX_EXPR), given: r.given === true }));
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

export function mountCalculator(container, { onUse, onEscape, storageKey = DEFAULT_KEY, owner = '' } = {}) {
  const id = `calc${++uid}`;
  let nextId = 1;
  const withId = r => ({ id: nextId++, label: r.label, expr: r.expr, given: r.given === true });
  let rows = (readStore(storageKey, owner) || [{ label: '_a', expr: '' }]).map(withId);
  let results = [];
  let useEnabled = true;
  let announceTimer = 0;
  let lastFocusedRow = null;

  // ---- static shell ----
  const root = el('div', 'calc');
  const list = el('ol', 'calc-rows', { 'aria-label': 'Calculator rows' });
  const foot = el('div', 'calc-foot');
  const addBtn = withIcon(el('button', 'btn btn-small calc-add', { type: 'button' }), 'plus', 'Row');
  addBtn.setAttribute('aria-label', 'Add row');
  const clearBtn = withIcon(el('button', 'btn btn-small btn-ghost calc-clear', { type: 'button' }), 'eraser', 'Clear');
  clearBtn.setAttribute('aria-label', 'Clear all rows');
  foot.append(addBtn, clearBtn);
  const status = el('p', 'calc-status', { role: 'status' });
  const useHint = el('p', 'calc-use-hint');
  useHint.hidden = true;
  const help = el('p', 'calc-help');
  help.textContent = 'Use + − × ÷ ^ % ( ), pi, e. Functions: sqrt, round(x, 2), min, max, log, ln, sin… (degrees). Type a row name like _a to reuse its value.';
  const live = el('div', 'sr-only', { 'aria-live': 'polite', 'aria-atomic': 'true' });
  root.append(list, foot, status, useHint, help, live);
  container.appendChild(root);

  // ---- persistence ----
  function save() {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ v: 1, owner: String(owner ?? ''), rows: rows.map(r => (r.given ? { label: r.label, expr: r.expr, given: true } : { label: r.label, expr: r.expr })) }));
    } catch { /* storage full or blocked: the sheet still works for this page */ }
  }

  // ---- rendering ----
  const rowEl = rid => list.querySelector(`li[data-id="${rid}"]`);

  function buildRow(row, index) {
    const li = el('li', 'calc-row');
    li.dataset.id = String(row.id);
    const main = el('div', 'calc-row-main');
    const labelId = `${id}-l${row.id}`;
    const exprId = `${id}-e${row.id}`;
    const errId = `${id}-x${row.id}`;
    const lblLabel = el('label', 'sr-only', { for: labelId });
    lblLabel.textContent = `Name of row ${index + 1}${row.given ? ' (given value)' : ''}`;
    const lbl = el('input', 'calc-label', {
      id: labelId, type: 'text', maxlength: '24', autocomplete: 'off', autocapitalize: 'off',
      autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'next', 'aria-describedby': errId,
    });
    lbl.value = row.label;
    const eq = el('span', 'calc-eq', { 'aria-hidden': 'true' });
    eq.textContent = '=';
    const exLabel = el('label', 'sr-only calc-expr-name', { for: exprId });
    const ex = el('input', 'calc-expr', {
      id: exprId, type: 'text', inputmode: 'text', maxlength: String(MAX_EXPR), autocomplete: 'off',
      autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'enter', placeholder: 'e.g. 2*pi*3',
    });
    ex.value = row.expr;
    main.append(lblLabel, lbl, eq, exLabel, ex);

    const out = el('div', 'calc-row-out');
    if (row.given) {
      li.classList.add('is-given');
      const g = el('span', 'calc-given', { title: 'Given in the question. Edit it to keep it for later questions.' });
      g.textContent = 'given';
      out.appendChild(g);
    }
    const res = el('output', 'calc-result', { for: exprId });
    const use = el('button', 'btn btn-small btn-soft calc-use', { type: 'button' });
    use.textContent = 'Use';
    const del = withIcon(el('button', 'btn btn-small calc-del', { type: 'button' }), 'trash-2');
    out.append(res, use, del);
    const err = el('p', 'calc-label-err', { id: errId });
    err.hidden = true;
    li.append(main, out, err);
    nameRow(li, row);
    return li;
  }

  // Accessible names that mention the row label (textContent / attributes only).
  function nameRow(li, row) {
    li.querySelector('.calc-expr-name').textContent = `Expression for ${row.label}`;
    li.querySelector('.calc-use').setAttribute('aria-label', `Use the value of ${row.label} as your answer`);
    li.querySelector('.calc-del').setAttribute('aria-label', `Delete row ${row.label}`);
  }

  function renderAll() {
    list.textContent = '';
    rows.forEach((r, i) => list.appendChild(buildRow(r, i)));
    icons();
    recompute();
  }

  function resultText(r) {
    if (!r) return { text: '', kind: 'empty' };
    if (r.error) return { text: r.error, kind: 'error' };
    if (r.value === null) return { text: '—', kind: 'empty' };
    try { return { text: formatValue(r.value), kind: 'value' }; } catch { return { text: 'not a finite number', kind: 'error' }; }
  }

  function recompute() {
    results = evaluateSheet(rows.map(r => ({ label: r.label, expr: r.expr })));
    rows.forEach((row, i) => {
      const li = rowEl(row.id);
      if (!li) return;
      const r = results[i];
      const { text, kind } = resultText(r);
      const out = li.querySelector('.calc-result');
      out.className = `calc-result is-${kind}`;
      out.textContent = '';
      if (kind === 'error') {
        out.innerHTML = icon('circle-alert'); // constant markup
        const s = el('span');
        s.textContent = text;
        out.appendChild(s);
        out.setAttribute('title', text);
      } else {
        const s = el('span', 'calc-value');
        s.textContent = text;
        out.appendChild(s);
        out.removeAttribute('title');
        if (kind === 'value') out.setAttribute('aria-label', `${row.label} = ${text}`);
      }
      if (kind !== 'value') out.removeAttribute('aria-label');
      if (r && r.deg && kind === 'value') {
        const d = el('span', 'calc-deg', { title: 'Trig functions use degrees' });
        d.textContent = 'deg';
        out.appendChild(d);
      }
      li.querySelector('.calc-expr').setAttribute('aria-invalid', kind === 'error' ? 'true' : 'false');
      const use = li.querySelector('.calc-use');
      use.disabled = !useEnabled || kind !== 'value';
    });
    icons();
  }

  // Politely announce the result of the row being edited, after typing pauses.
  function announce(rowId) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      const i = rows.findIndex(r => r.id === rowId);
      if (i < 0) return;
      const { text, kind } = resultText(results[i]);
      live.textContent = kind === 'value' ? `${rows[i].label} equals ${text}` : kind === 'error' ? `${rows[i].label}: ${text}` : '';
    }, 700);
  }

  function setStatus(text) {
    status.textContent = text || '';
  }

  // ---- row actions ----
  function addRow(focus = true) {
    if (rows.length >= MAX_ROWS) {
      setStatus(`The sheet holds at most ${MAX_ROWS} rows.`);
      return;
    }
    setStatus('');
    const row = withId({ label: nextLabel(rows), expr: '' });
    rows.push(row);
    list.appendChild(buildRow(row, rows.length - 1));
    icons();
    save();
    recompute();
    if (focus) rowEl(row.id)?.querySelector('.calc-expr')?.focus();
  }

  function deleteRow(rid) {
    const i = rows.findIndex(r => r.id === rid);
    if (i < 0) return;
    rows.splice(i, 1);
    setStatus('');
    if (!rows.length) rows.push(withId({ label: '_a', expr: '' }));
    renderAll();
    save();
    const next = rows[Math.min(i, rows.length - 1)];
    rowEl(next.id)?.querySelector('.calc-expr')?.focus();
  }

  function clearSheet() {
    rows = [withId({ label: '_a', expr: '' })];
    setStatus('');
    renderAll();
    save();
  }

  function rowOf(node) {
    const li = node?.closest?.('.calc-row');
    if (!li || !list.contains(li)) return null;
    const rid = Number(li.dataset.id);
    const row = rows.find(r => r.id === rid);
    return row ? { li, row } : null;
  }

  // ---- events ----
  list.addEventListener('input', e => {
    const hit = rowOf(e.target);
    if (!hit) return;
    const { li, row } = hit;
    if (row.given) {
      // Editing a pre-filled row makes it the user's own: it's kept when the next question comes.
      row.given = false;
      li.classList.remove('is-given');
      li.querySelector('.calc-given')?.remove();
      const sr = li.querySelector('label.sr-only:not(.calc-expr-name)');
      if (sr) sr.textContent = sr.textContent.replace(' (given value)', '');
      save();
    }
    if (e.target.classList.contains('calc-expr')) {
      row.expr = e.target.value.slice(0, MAX_EXPR);
      save();
      recompute();
      announce(row.id);
    } else if (e.target.classList.contains('calc-label')) {
      // Labels always start with "_": add it as soon as the user types without it.
      const raw = e.target.value;
      const v = normalizeLabel(raw);
      if (v !== raw) {
        const caret = e.target.selectionStart ?? raw.length;
        e.target.value = v;
        try { e.target.setSelectionRange(caret + 1, caret + 1); } catch { /* ignore */ }
      }
      const others = rows.filter(r => r !== row).map(r => r.label);
      const problem = labelProblem(v, others);
      const err = li.querySelector('.calc-label-err');
      err.textContent = problem ? `Name: ${problem}` : '';
      err.hidden = !problem;
      e.target.setAttribute('aria-invalid', problem ? 'true' : 'false');
      if (problem || v === row.label) return;
      // Valid new name: rename and rewrite references in the other rows straight away.
      const renamed = renameLabel(rows, row.label, v);
      rows.forEach((r, i) => {
        const nr = renamed[i];
        r.label = nr.label;
        if (nr.expr !== r.expr) {
          r.expr = nr.expr;
          const input = rowEl(r.id)?.querySelector('.calc-expr');
          if (input && input.value !== r.expr) input.value = r.expr;
        }
      });
      nameRow(li, row);
      save();
      recompute();
      announce(row.id);
    }
  });

  // Leaving a label with an invalid name puts the last good name back.
  list.addEventListener('change', e => {
    if (!e.target.classList.contains('calc-label')) return;
    const hit = rowOf(e.target);
    if (!hit) return;
    if (e.target.value !== hit.row.label) e.target.value = hit.row.label;
    const err = hit.li.querySelector('.calc-label-err');
    err.textContent = '';
    err.hidden = true;
    e.target.setAttribute('aria-invalid', 'false');
  });

  list.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const hit = rowOf(btn);
    if (!hit) return;
    if (btn.classList.contains('calc-del')) deleteRow(hit.row.id);
    else if (btn.classList.contains('calc-use')) {
      const i = rows.indexOf(hit.row);
      const r = results[i];
      if (!useEnabled || !r || r.error || typeof r.value !== 'number') return;
      let s;
      try { s = formatValue(r.value); } catch { return; }
      if (typeof onUse === 'function') onUse(s);
    }
  });

  list.addEventListener('focusin', e => {
    const hit = rowOf(e.target);
    if (hit) lastFocusedRow = hit.row.id;
  });

  addBtn.addEventListener('click', () => addRow(true));
  clearBtn.addEventListener('click', () => {
    if (!confirm('Clear the calculator? All rows will be removed.')) return;
    clearSheet();
    focus();
  });

  // Keys inside the calculator never reach the quiz (Enter must not submit the answer).
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (typeof onEscape === 'function') onEscape();
      return;
    }
    if (e.key === 'Enter') {
      e.stopPropagation();
      if (e.isComposing) return;
      const t = e.target;
      if (t.tagName !== 'INPUT') return; // buttons keep their normal Enter = click
      e.preventDefault();
      const hit = rowOf(t);
      if (!hit) return;
      if (t.classList.contains('calc-label')) {
        hit.li.querySelector('.calc-expr')?.focus();
        return;
      }
      const i = rows.indexOf(hit.row);
      if (i === rows.length - 1) addRow(true);
      else rowEl(rows[i + 1].id)?.querySelector('.calc-expr')?.focus();
      return;
    }
    if (e.target.tagName === 'INPUT' && !e.ctrlKey && !e.metaKey) e.stopPropagation();
  });

  // Replace the untouched given rows of the previous question with this question's (may be empty).
  function setGiven(list) {
    const kept = rows.filter(r => !r.given);
    // A blank row (e.g. the starter "_a") gives way to a given label: it moves to the next free
    // name instead, so the given rows keep the names the explanation uses.
    const wanted = new Set((Array.isArray(list) ? list : []).map(g => String(g?.label ?? '').toLowerCase()));
    let renamed = false;
    for (const r of kept) {
      if (r.expr.trim() || !wanted.has(r.label.toLowerCase())) continue;
      r.label = nextLabel([...kept, ...[...wanted].map(label => ({ label }))]);
      renamed = true;
    }
    const used = new Set(kept.map(r => r.label.toLowerCase()));
    const room = Math.max(0, MAX_ROWS - kept.length);
    const fresh = [];
    for (const g of Array.isArray(list) ? list.slice(0, GIVEN_MAX) : []) {
      if (fresh.length >= room) break;
      if (!g || typeof g.label !== 'string' || !LABEL_RE.test(g.label)) continue;
      const expr = givenExpr(g.value);
      if (!expr) continue;
      const label = uniqueLabel(g.label, used);
      if (!label) continue;
      used.add(label.toLowerCase());
      fresh.push(withId({ label, expr, given: true }));
    }
    if (kept.length === rows.length && !fresh.length && !renamed) return; // nothing to change
    rows = [...fresh, ...kept];
    if (!rows.length) rows.push(withId({ label: nextLabel([]), expr: '' }));
    if (lastFocusedRow && !rows.some(r => r.id === lastFocusedRow)) lastFocusedRow = null;
    setStatus('');
    renderAll();
    save();
  }

  function focus() {
    const target = (lastFocusedRow && rowEl(lastFocusedRow)) || list.lastElementChild;
    target?.querySelector('.calc-expr')?.focus();
  }

  renderAll();
  save();

  return {
    setVisible(v) {
      root.hidden = !v;
    },
    // [{ label, expr, value }] for rows with an expression (value: number, or null on error).
    snapshot() {
      const out = [];
      rows.forEach((r, i) => {
        if (!r.expr.trim() || out.length >= MAX_ROWS) return;
        const res = results[i];
        out.push({ label: r.label, expr: r.expr, value: res && typeof res.value === 'number' && Number.isFinite(res.value) ? res.value : null });
      });
      return out;
    },
    clear: clearSheet,
    focus,
    setGiven,
    setUseEnabled(enabled, hint) {
      useEnabled = !!enabled;
      useHint.textContent = !enabled && hint ? hint : '';
      useHint.hidden = !useHint.textContent;
      recompute();
    },
    destroy({ forget = false } = {}) {
      clearTimeout(announceTimer);
      root.remove();
      if (forget) {
        try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
      }
    },
  };
}
