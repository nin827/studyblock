// Journal entry answers (answerType "journal"): an Account | Debit | Credit table. Every cell can be
// typed into, or filled from a bank of account and amount blocks: drag a block onto a cell (Pointer
// Events, 6px threshold, `touch-action: none` on blocks only), or tap a cell then a block, or a block
// then a cell. Blocks are reusable. Keyboard: Tab through the cells and blocks; Enter on a block fills
// the active cell (the cell last focused); Enter in a cell moves on, and checks from the last one.
// Placements are announced politely. Pure grading lives in js/lib/journal.js.
// Everything user-typed or imported is escaped (esc) or set as a property, never parsed as HTML.

import { esc, icon, icons } from './ui.js';
import {
  JOURNAL_MIN_LINES, JOURNAL_MAX_LINES, parseAmount, fmtAmountPlain, fmtMoney, gradeJournal, journalTotals, parseJournal, serialiseJournal,
} from '../lib/journal.js';

const DRAG_THRESHOLD = 6;
const FIELDS = ['account', 'dr', 'cr'];
const FIELD_NAME = { account: 'account', dr: 'debit', cr: 'credit' };
const fits = (kind, field) => (kind === 'account' ? field === 'account' : field === 'dr' || field === 'cr');

// The form: table, row tools, totals, the block bank and help. One journal per page (fixed ids).
export function journalHtml(q) {
  const accounts = Array.isArray(q.accounts) ? q.accounts : [];
  const amounts = Array.isArray(q.amounts) ? q.amounts : [];
  return `<form class="answer-form journal-form" id="answer-form" autocomplete="off" novalidate>
    <div class="journal-head">
      <p class="field-label" id="journal-label">Your journal entry</p>
      <div class="journal-tools">
        <button type="button" class="btn btn-small" id="journal-add">${icon('plus')}<span>Row</span></button>
        <button type="button" class="btn btn-small" id="journal-reset">${icon('rotate-ccw')}<span>Reset</span></button>
      </div>
    </div>
    <div class="journal-wrap">
      <table class="journal-table" aria-labelledby="journal-label" aria-describedby="journal-help">
        <thead><tr><th scope="col">Account</th><th scope="col">Debit</th><th scope="col">Credit</th><th scope="col"><span class="sr-only">Row</span></th></tr></thead>
        <tbody id="journal-rows"></tbody>
      </table>
    </div>
    <p class="journal-totals" id="journal-totals"></p>
    <datalist id="journal-accounts">${accounts.map(a => `<option value="${esc(a)}"></option>`).join('')}</datalist>
    <div class="journal-bank" id="journal-bank">
      <p class="field-label journal-bank-label" id="journal-acc-label">Account blocks</p>
      <div class="tiles-row journal-bank-row" role="group" aria-labelledby="journal-acc-label">${accounts.map((a, i) =>
        `<button type="button" class="tile j-block j-block-acc" data-kind="account" data-i="${i}" aria-pressed="false"><span class="tile-label">${esc(a)}</span><span class="sr-only">, account block</span></button>`).join('')}</div>
      ${amounts.length ? `<p class="field-label journal-bank-label" id="journal-amt-label">Amount blocks</p>
      <div class="tiles-row journal-bank-row" role="group" aria-labelledby="journal-amt-label">${amounts.map((n, i) =>
        `<button type="button" class="tile j-block j-block-amt" data-kind="amount" data-i="${i}" aria-pressed="false"><span class="tile-label">${esc(fmtMoney(n))}</span><span class="sr-only">, amount block</span></button>`).join('')}</div>` : ''}
    </div>
    <p class="tiles-help muted" id="journal-help">Type in any cell, or drop a block on it. Tap a cell, then a block (or a block, then a cell). Blocks can be used again. One amount per row: Debit or Credit.</p>
    <p class="sr-only" id="journal-status" aria-live="polite"></p>
  </form>`;
}

/*
 * Wires the form made by journalHtml(q). `opts`: onChange() after any edit, onFocusCell() when the
 * focused cell changes (the calculator's Use follows it), onSubmit() from Enter in the last cell.
 * Returns the controller the quiz uses.
 */
export function mountJournal(form, q, opts = {}) {
  const tbody = form.querySelector('#journal-rows');
  const accounts = Array.isArray(q.accounts) ? q.accounts : [];
  const amounts = Array.isArray(q.amounts) ? q.amounts : [];
  const startRows = Math.min(JOURNAL_MAX_LINES, Math.max(JOURNAL_MIN_LINES, q.rows | 0));
  const blank = () => ({ account: '', dr: '', cr: '', locked: false, mark: null });
  let rows = Array.from({ length: startRows }, blank);
  let active = null;   // { row, field }: the cell tapped blocks go into
  let lastAmount = null; // { row, field }: the amount cell the calculator's Use fills
  let armed = null;    // { kind, value, label, el }: a tapped block waiting for a cell
  let locked = false;
  let drag = null;
  let pointerAt = -Infinity;
  let scrollRaf = 0;
  let revealed = false;

  const announce = msg => { const s = form.querySelector('#journal-status'); if (s) s.textContent = msg; };
  const inputOf = (r, f) => form.querySelector(`.j-input[data-row="${r}"][data-field="${f}"]`);
  const cellName = (r, f) => `line ${r + 1}, ${FIELD_NAME[f]}`;
  const canEdit = r => !locked && !!rows[r] && !rows[r].locked;

  function markHtml(m) {
    if (m === true) return `<span class="j-mark is-right">${icon('circle-check')}<span>Right</span></span>`;
    if (m === false) return `<span class="j-mark is-wrong">${icon('circle-x')}<span>Wrong</span></span>`;
    return '';
  }

  function rowHtml(row, r) {
    const dis = locked || row.locked ? ' disabled' : '';
    const cell = (f, cls, attrs) => {
      const val = row[f];
      const bad = f !== 'account' && val.trim() && parseAmount(val) === null;
      const act = active && active.row === r && active.field === f && !dis ? ' is-active' : '';
      return `<td class="j-cell ${cls}${act}" data-row="${r}" data-field="${f}"><span class="j-cap" aria-hidden="true">${f === 'account' ? 'Account' : f === 'dr' ? 'Debit' : 'Credit'}</span>
        <input class="j-input" type="text" data-row="${r}" data-field="${f}" value="${esc(val)}" aria-label="Line ${r + 1}, ${FIELD_NAME[f]}"${bad ? ' aria-invalid="true"' : ''}
          autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${attrs}${dis}></td>`;
    };
    const end = row.mark !== null && row.mark !== undefined
      ? markHtml(row.mark)
      : dis ? ''
      : `<button type="button" class="btn j-remove" data-remove="${r}" aria-label="Remove line ${r + 1}"${dis || rows.length <= JOURNAL_MIN_LINES ? ' disabled' : ''}>${icon('x')}</button>`;
    const state = row.mark === true ? ' is-right' : row.mark === false ? ' is-wrong' : '';
    return `<tr class="j-row${state}${row.locked ? ' is-locked' : ''}" data-row="${r}">
      ${cell('account', 'j-acc', `list="journal-accounts" enterkeyhint="next"`)}
      ${cell('dr', 'j-amt', `inputmode="decimal" enterkeyhint="next"`)}
      ${cell('cr', 'j-amt', `inputmode="decimal" enterkeyhint="next"`)}
      <td class="j-end">${end}</td>
    </tr>`;
  }

  function render(focus = null) {
    tbody.innerHTML = rows.map(rowHtml).join('');
    const add = form.querySelector('#journal-add');
    if (add) add.disabled = locked || rows.length >= JOURNAL_MAX_LINES;
    const reset = form.querySelector('#journal-reset');
    if (reset) reset.disabled = locked;
    form.classList.toggle('is-locked', locked);
    form.classList.toggle('is-revealed', revealed);
    totals();
    icons();
    if (focus) inputOf(focus.row, focus.field)?.focus({ preventScroll: false });
  }

  // "Debits $X · Credits $Y" with Balanced / Not balanced (icon + text). Informational only.
  function totals() {
    const el = form.querySelector('#journal-totals');
    if (!el) return;
    const t = journalTotals(lines());
    const any = t.dr > 0 || t.cr > 0;
    const ok = any && Math.abs(t.dr - t.cr) < 0.005;
    el.className = `journal-totals${any ? (ok ? ' is-balanced' : ' is-unbalanced') : ''}`;
    el.innerHTML = `<span class="j-tot">Debits <strong>${esc(fmtMoney(t.dr))}</strong></span><span class="j-tot-sep" aria-hidden="true">·</span><span class="j-tot">Credits <strong>${esc(fmtMoney(t.cr))}</strong></span>${any
      ? `<span class="j-bal">${icon(ok ? 'circle-check' : 'circle-x')}<span>${ok ? 'Balanced' : 'Not balanced'}</span></span>` : ''}`;
    icons();
  }

  // The rows as journal lines ({ account, side, amount }); blank rows stay (account '' and no amount).
  function lines() {
    return rows.map(row => {
      const dr = parseAmount(row.dr);
      const cr = parseAmount(row.cr);
      const side = dr !== null ? 'dr' : cr !== null ? 'cr' : null;
      return { account: row.account.trim(), side, amount: side === 'dr' ? dr : side === 'cr' ? cr : null };
    });
  }

  function changed(r) {
    if (rows[r] && rows[r].mark === false) {
      rows[r].mark = null;
      const tr = tbody.querySelector(`tr[data-row="${r}"]`);
      tr?.classList.remove('is-wrong');
      const end = tr?.querySelector('.j-end');
      if (end) {
        end.innerHTML = `<button type="button" class="btn j-remove" data-remove="${r}" aria-label="Remove line ${r + 1}"${rows.length <= JOURNAL_MIN_LINES ? ' disabled' : ''}>${icon('x')}</button>`;
        icons();
      }
    }
    totals();
    opts.onChange?.();
  }

  // Writes a value into one cell (state + input). An amount clears the other side of its row.
  function setCell(r, f, value) {
    rows[r][f] = value;
    const inp = inputOf(r, f);
    if (inp) { inp.value = value; inp.removeAttribute('aria-invalid'); }
    if (f !== 'account' && value) {
      const other = f === 'dr' ? 'cr' : 'dr';
      rows[r][other] = '';
      const o = inputOf(r, other);
      if (o) { o.value = ''; o.removeAttribute('aria-invalid'); }
    }
    changed(r);
  }

  function setActive(cell) {
    active = cell && canEdit(cell.row) ? cell : null;
    form.querySelectorAll('.j-cell.is-active').forEach(td => td.classList.remove('is-active'));
    if (active) form.querySelector(`.j-cell[data-row="${active.row}"][data-field="${active.field}"]`)?.classList.add('is-active');
  }

  function disarm() {
    if (armed?.el) { armed.el.setAttribute('aria-pressed', 'false'); armed.el.classList.remove('is-armed'); }
    armed = null;
    form.classList.remove('is-armed-account', 'is-armed-amount');
  }

  const blockOf = el => {
    const kind = el.dataset.kind;
    const i = +el.dataset.i;
    if (kind === 'account' && accounts[i] !== undefined) return { kind, value: accounts[i], label: accounts[i], el };
    if (kind === 'amount' && amounts[i] !== undefined) return { kind, value: fmtAmountPlain(amounts[i]), label: fmtMoney(amounts[i]), el };
    return null;
  };

  // Puts a block's value into a cell, if the kinds fit. Returns true when placed.
  function place(block, r, f) {
    if (!block || !canEdit(r) || !fits(block.kind, f)) return false;
    setCell(r, f, block.value);
    announce(`Placed ${block.label} in ${cellName(r, f)}`);
    return true;
  }

  // A block tapped (or Enter/Space): fill the active cell if it fits, else wait for a cell.
  function activateBlock(el) {
    if (locked || !el || el.disabled) return;
    const b = blockOf(el);
    if (!b) return;
    if (armed && armed.el === el) { disarm(); announce(`${b.label} put back`); return; }
    if (active && fits(b.kind, active.field) && place(b, active.row, active.field)) {
      const done = active;
      setActive(null);
      disarm();
      if (done.field !== 'account') lastAmount = done;
      return;
    }
    disarm();
    armed = b;
    el.setAttribute('aria-pressed', 'true');
    el.classList.add('is-armed');
    form.classList.add(b.kind === 'account' ? 'is-armed-account' : 'is-armed-amount');
    announce(`${b.label} picked up. Now choose ${b.kind === 'account' ? 'an Account cell' : 'a Debit or Credit cell'}.`);
  }

  // A cell tapped while a block waits: fill it.
  function cellTapped(r, f) {
    if (!armed) return false;
    if (!fits(armed.kind, f)) { announce(`${armed.label} goes in ${armed.kind === 'account' ? 'an Account cell' : 'a Debit or Credit cell'}`); return false; }
    const ok = place(armed, r, f);
    if (ok) {
      disarm();
      setActive(null); // the next tapped block waits for a cell again
      if (f !== 'account') lastAmount = { row: r, field: f };
    }
    return ok;
  }

  // ---- dragging ----
  function cancelDrag() {
    if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = 0; }
    if (!drag) return;
    drag.ghost?.remove();
    drag.el.classList.remove('is-drag-source');
    form.querySelectorAll('.j-cell.is-over').forEach(td => td.classList.remove('is-over'));
    document.body.classList.remove('tiles-dragging');
    drag = null;
  }
  function cellAt(x, y, kind) {
    const el = document.elementFromPoint(x, y);
    const td = el?.closest?.('.j-cell');
    if (!td || !form.contains(td)) return null;
    const r = +td.dataset.row, f = td.dataset.field;
    return fits(kind, f) && canEdit(r) ? { td, row: r, field: f } : null;
  }
  function onPointerDown(e) {
    const el = e.target.closest?.('.j-block');
    if (!el || el.disabled || locked) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelDrag();
    drag = { id: e.pointerId, el, kind: el.dataset.kind, x0: e.clientX, y0: e.clientY, active: false, ghost: null };
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_THRESHOLD) return;
      drag.active = true;
      const r = drag.el.getBoundingClientRect();
      drag.dx = drag.x0 - r.left;
      drag.dy = drag.y0 - r.top;
      const g = drag.el.cloneNode(true);
      g.removeAttribute('data-kind');
      g.removeAttribute('data-i');
      g.removeAttribute('aria-pressed');
      g.classList.add('tile-ghost');
      g.setAttribute('aria-hidden', 'true');
      g.tabIndex = -1;
      g.style.width = `${r.width}px`;
      g.style.height = `${r.height}px`;
      document.body.appendChild(g);
      drag.ghost = g;
      drag.el.classList.add('is-drag-source');
      document.body.classList.add('tiles-dragging');
    }
    e.preventDefault();
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.ghost.style.transform = `translate(${Math.round(e.clientX - drag.dx)}px, ${Math.round(e.clientY - drag.dy)}px)`;
    showOver();
    if (!scrollRaf) scrollRaf = requestAnimationFrame(autoScroll);
  }
  function showOver() {
    const zone = cellAt(drag.x, drag.y, drag.kind);
    form.querySelectorAll('.j-cell.is-over').forEach(td => { if (td !== zone?.td) td.classList.remove('is-over'); });
    zone?.td.classList.add('is-over');
  }
  // Near the top or bottom edge the page scrolls, so a block can reach rows out of view (phones).
  const SCROLL_EDGE = 72;
  function autoScroll() {
    scrollRaf = 0;
    if (!drag?.active) return;
    const h = window.innerHeight;
    const dy = drag.y < SCROLL_EDGE ? -Math.ceil((SCROLL_EDGE - drag.y) / 4)
      : drag.y > h - SCROLL_EDGE ? Math.ceil((drag.y - (h - SCROLL_EDGE)) / 4) : 0;
    if (!dy) return;
    window.scrollBy(0, dy);
    showOver();
    scrollRaf = requestAnimationFrame(autoScroll);
  }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    pointerAt = performance.now();
    if (!d.active) { drag = null; activateBlock(d.el); return; }
    const zone = cellAt(e.clientX, e.clientY, d.kind);
    cancelDrag();
    if (zone) {
      const b = blockOf(d.el);
      if (place(b, zone.row, zone.field)) {
        disarm();
        setActive(null);
        if (zone.field !== 'account') lastAmount = { row: zone.row, field: zone.field };
      }
    } else {
      announce('Drop a block on a cell of the table');
    }
  }

  // ---- events ----
  function onClick(e) {
    const blockEl = e.target.closest?.('.j-block');
    if (blockEl) {
      // Pointer taps and drops are handled on pointerup; this click is the same gesture.
      if (e.detail > 0 && performance.now() - pointerAt < 1000) { e.preventDefault(); return; }
      activateBlock(blockEl);
      return;
    }
    const rm = e.target.closest?.('.j-remove');
    if (rm && !rm.disabled) { removeRow(+rm.dataset.remove); return; }
    const td = e.target.closest?.('.j-cell');
    if (td && !locked) {
      const r = +td.dataset.row, f = td.dataset.field;
      if (cellTapped(r, f)) return;
      if (e.target === td || e.target.classList.contains('j-cap')) inputOf(r, f)?.focus();
    }
  }
  function onFocusIn(e) {
    const inp = e.target.closest?.('.j-input');
    if (!inp) return;
    const cell = { row: +inp.dataset.row, field: inp.dataset.field };
    setActive(cell);
    if (cell.field !== 'account') lastAmount = cell;
    opts.onFocusCell?.(cell);
  }
  function onInput(e) {
    const inp = e.target.closest?.('.j-input');
    if (!inp) return;
    const r = +inp.dataset.row, f = inp.dataset.field;
    if (!canEdit(r)) return;
    rows[r][f] = inp.value;
    if (f !== 'account') {
      const bad = inp.value.trim() && parseAmount(inp.value) === null;
      if (bad) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
      if (inp.value.trim()) {
        const other = f === 'dr' ? 'cr' : 'dr';
        if (rows[r][other]) {
          rows[r][other] = '';
          const o = inputOf(r, other);
          if (o) { o.value = ''; o.removeAttribute('aria-invalid'); }
        }
      }
    }
    changed(r);
  }
  function onKeyDown(e) {
    if (e.key === 'Escape' && (armed || active)) {
      if (armed) { e.preventDefault(); e.stopPropagation(); const l = armed.label; disarm(); announce(`${l} put back`); }
    }
  }

  function addRow() {
    if (locked || rows.length >= JOURNAL_MAX_LINES) return;
    rows.push(blank());
    render({ row: rows.length - 1, field: 'account' });
    announce(`Line ${rows.length} added`);
    opts.onChange?.();
  }
  function removeRow(r) {
    if (!canEdit(r) || rows.length <= JOURNAL_MIN_LINES) return;
    rows.splice(r, 1);
    active = null;
    if (lastAmount && lastAmount.row >= r) lastAmount = lastAmount.row === r ? null : { ...lastAmount, row: lastAmount.row - 1 };
    render();
    const next = Math.min(r, rows.length - 1);
    (inputOf(next, 'account') || form.querySelector('#journal-add'))?.focus();
    announce(`Line ${r + 1} removed`);
    opts.onChange?.();
  }
  function reset() {
    if (locked) return;
    const kept = rows.filter(row => row.locked);
    rows = [...kept, ...Array.from({ length: Math.max(0, startRows - kept.length) }, blank)];
    if (rows.length < JOURNAL_MIN_LINES) rows.push(blank());
    active = null;
    lastAmount = null;
    disarm();
    render();
    focusFirst();
    announce('Entry cleared');
    opts.onChange?.();
  }

  form.addEventListener('click', onClick);
  form.addEventListener('focusin', onFocusIn);
  form.addEventListener('input', onInput);
  form.addEventListener('keydown', onKeyDown);
  form.addEventListener('pointerdown', onPointerDown);
  form.addEventListener('pointermove', onPointerMove);
  form.addEventListener('pointerup', onPointerUp);
  form.addEventListener('pointercancel', cancelDrag);
  form.addEventListener('lostpointercapture', e => { if (drag && drag.id === e.pointerId && drag.active) cancelDrag(); });
  form.querySelector('#journal-add')?.addEventListener('click', addRow);
  form.querySelector('#journal-reset')?.addEventListener('click', reset);
  render();

  function focusFirst() {
    for (let r = 0; r < rows.length; r++) {
      if (!canEdit(r)) continue;
      for (const f of FIELDS) {
        if (f === 'account' ? !rows[r].account.trim() : !rows[r].dr.trim() && !rows[r].cr.trim()) { inputOf(r, f)?.focus(); return; }
      }
    }
    form.querySelector('.j-input:not(:disabled)')?.focus();
  }

  const ready = () => !locked && lines().some(l => l.account && l.amount !== null);

  function lock() {
    locked = true;
    disarm();
    cancelDrag();
    active = null;
    render();
    form.querySelectorAll('.j-block, .j-remove').forEach(b => { b.disabled = true; });
  }

  return {
    // The canonical string of the rows (blank rows dropped), as the engine grades and stores it.
    value: () => serialiseJournal(lines()),
    lines,
    ready,
    focusFirst,
    // Enter in a cell: a waiting block fills it; else move on (account → debit → next line), and
    // from the last line's amount check when ready.
    enter(target) {
      const inp = target?.closest?.('.j-input');
      if (!inp) { if (ready()) opts.onSubmit?.(); return; }
      const r = +inp.dataset.row, f = inp.dataset.field;
      if (armed && cellTapped(r, f)) return;
      if (f === 'account') { inputOf(r, 'dr')?.focus(); return; }
      for (let k = r + 1; k < rows.length; k++) if (canEdit(k)) { inputOf(k, 'account')?.focus(); return; }
      if (ready()) opts.onSubmit?.();
    },
    // Calculator Use: fills the last-focused Debit/Credit cell.
    canUse: () => !locked && !!lastAmount && canEdit(lastAmount.row),
    useValue(v) {
      if (!lastAmount || !canEdit(lastAmount.row)) return false;
      const n = parseAmount(String(v));
      setCell(lastAmount.row, lastAmount.field, n === null ? String(v) : fmtAmountPlain(n));
      inputOf(lastAmount.row, lastAmount.field)?.focus();
      announce(`Placed ${v} in ${cellName(lastAmount.row, lastAmount.field)}`);
      return true;
    },
    // After Check: marks each non-blank row Right / Wrong (icon + text). Guided: right rows lock,
    // wrong ones stay editable (the mark clears on the next edit). Returns the marks.
    markResult({ guided = false } = {}) {
      const marks = gradeJournal(q, lines()).lines;
      rows.forEach((row, r) => {
        row.mark = marks[r];
        if (guided && marks[r] === true) row.locked = true;
      });
      disarm();
      setActive(null);
      render();
      return marks;
    },
    lock,
    // Guided Show solution: the correct lines, filled in and locked.
    showSolution() {
      const ls = Array.isArray(q.lines) && q.lines.length ? q.lines : parseJournal(String(q.answer ?? '')) || [];
      rows = ls.map(l => ({ account: l.account, dr: l.side === 'dr' ? fmtAmountPlain(l.amount) : '', cr: l.side === 'cr' ? fmtAmountPlain(l.amount) : '', locked: true, mark: null }));
      revealed = true;
      lock();
    },
    destroy() { cancelDrag(); },
  };
}

/*
 * A static journal table (feedback, review, History). `lines` = [{ account, side, amount }] (gaps
 * shown as "?"), `marks` (optional) = true/false per line. Escaped throughout.
 */
export function journalTableHtml(lines, { label = 'Journal entry', marks = null } = {}) {
  const ls = Array.isArray(lines) ? lines : [];
  const dr = ls.filter(l => l.side === 'dr');
  const cr = ls.filter(l => l.side === 'cr');
  const other = ls.filter(l => l.side !== 'dr' && l.side !== 'cr');
  const ordered = [...dr, ...cr, ...other];
  const t = journalTotals(ls);
  const amt = (l, side) => (l.side === side && typeof l.amount === 'number' ? esc(fmtMoney(l.amount)) : '');
  const markCell = l => {
    if (!marks) return '';
    const m = marks[ls.indexOf(l)];
    return `<td class="j-static-mark">${m === true ? `${icon('circle-check')}<span>Right</span>` : m === false ? `${icon('circle-x')}<span>Wrong</span>` : ''}</td>`;
  };
  return `<div class="table-wrap journal-static-wrap"><table class="journal-static" aria-label="${esc(label)}">
    <thead><tr><th scope="col">Account</th><th scope="col" class="num">Debit</th><th scope="col" class="num">Credit</th>${marks ? '<th scope="col"><span class="sr-only">Mark</span></th>' : ''}</tr></thead>
    <tbody>${ordered.map(l => `<tr${marks ? ` class="${marks[ls.indexOf(l)] === true ? 'is-right' : marks[ls.indexOf(l)] === false ? 'is-wrong' : ''}"` : ''}><td${l.side === 'cr' ? ' class="j-cr-acc"' : ''}>${esc(l.account || '?')}</td><td class="num">${amt(l, 'dr')}</td><td class="num">${amt(l, 'cr')}${l.side !== 'dr' && l.side !== 'cr' ? '?' : ''}</td>${markCell(l)}</tr>`).join('')}</tbody>
    <tfoot><tr><th scope="row">Total</th><td class="num">${esc(fmtMoney(t.dr))}</td><td class="num">${esc(fmtMoney(t.cr))}</td>${marks ? '<td></td>' : ''}</tr></tfoot>
  </table></div>`;
}

// Review / History: the user's entry and (when wrong) the correct one, from the stored strings.
// Falls back to escaped text when a string isn't a journal.
export function journalReviewHtml(userAnswer, answer, correct) {
  const mine = typeof userAnswer === 'string' ? parseJournal(userAnswer) : null;
  const right = typeof answer === 'string' ? parseJournal(answer) : null;
  const block = (title, ls, raw) => `<div class="journal-review-part"><p class="journal-review-title">${esc(title)}</p>${
    ls && ls.length ? journalTableHtml(ls, { label: title }) : `<p><strong>${esc(raw === '' || raw === undefined || raw === null ? '(blank)' : String(raw))}</strong></p>`}</div>`;
  return `<div class="review-answers journal-review">${block('Your entry', mine, userAnswer)}${correct ? '' : block('Correct entry', right, answer)}</div>`;
}
