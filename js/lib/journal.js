// Journal entries (answerType "journal"): a table of Account | Debit | Credit lines.
// Pure helpers shared by the engine (shape check, grading), storage (import validation) and the
// quiz view: the spec check, the canonical string, its parser and the line matcher. No DOM.
//
// Canonical string (stored `answer` / `userAnswer`): "Dr Inventory 500; Cr Cash 500".
// Debits first, then credits, each sorted by account name (case-insensitive). Amounts are written
// plainly ("500", "12.5"). An incomplete user line keeps its gaps as "?": "? Cash ?" (account,
// no amount) or "Dr ? 500" (amount, no account).

export const JOURNAL_MIN_LINES = 2;
export const JOURNAL_MAX_LINES = 6;
export const JOURNAL_MIN_ACCOUNTS = 2;
export const JOURNAL_MAX_ACCOUNTS = 12;
export const JOURNAL_MAX_AMOUNTS = 8;
export const JOURNAL_ACCEPTS_MAX = 20;
export const JOURNAL_ACCOUNT_MAX = 60;
export const AMOUNT_TOLERANCE = 0.005;
const SIDES = ['dr', 'cr'];

// The text rules (as for text answers): trim, collapse whitespace, case-insensitive.
export const normAccount = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const isStr = v => typeof v === 'string';
// An account name a question may use: 1-60 characters, no ";" (the line separator), not "?".
const accountOk = s => isStr(s) && !!s.trim() && s.trim().length <= JOURNAL_ACCOUNT_MAX && !s.includes(';') && s.trim() !== '?' && !/[\r\n]/.test(s);
// A positive, finite amount with at most 2 decimal places.
export const amountOk = n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 1e12 && Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

// Reads a typed amount: "1200", "1,200", "$1,200.50", " 75 ". Returns a number, or null when the
// text is empty or not a plain non-negative amount.
export function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').trim().replace(/^\$\s*/, '');
  if (!s) return null;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Amount as written in the canonical string and in inputs: "500", "12.5" (at most 2 dp).
export const fmtAmountPlain = n => String(Math.round(n * 100) / 100);
// Amount as money: "$1,200", "$12.50".
export function fmtMoney(n) {
  const v = Math.round(n * 100) / 100;
  const whole = Math.trunc(v);
  const cents = Math.round((v - whole) * 100);
  const g = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${g}${cents ? `.${String(cents).padStart(2, '0')}` : ''}`;
}

/*
 * Checks a generator's journal fields and returns the clean spec, or null when the shape is bad:
 * { accounts: [string], amounts: [number], rows, lines: [{ account, side, amount }], accepts: { alias: account } }
 * - answer: 2-6 lines, each { account, side: "dr"|"cr", amount > 0 with ≤ 2 dp }, account+side unique,
 *   debits total = credits total, every account in `accounts`.
 * - accounts: 2-12 distinct names (by the text rules). amounts: ≤ 8 (optional; duplicates dropped).
 * - rows: integer 2-6 and ≥ the number of answer lines (default: the number of lines).
 * - accepts: optional alias → account map (≤ 20); entries naming an unknown account, or an alias that
 *   is itself one of the accounts, make the spec invalid (an alias must never make a decoy right).
 */
export function cleanJournalSpec(q) {
  if (!q || typeof q !== 'object') return null;
  const raw = q.answer;
  if (!Array.isArray(raw) || raw.length < JOURNAL_MIN_LINES || raw.length > JOURNAL_MAX_LINES) return null;
  const accounts = Array.isArray(q.accounts) ? q.accounts : null;
  if (!accounts || accounts.length < JOURNAL_MIN_ACCOUNTS || accounts.length > JOURNAL_MAX_ACCOUNTS || !accounts.every(accountOk)) return null;
  const accClean = accounts.map(a => a.trim().replace(/\s+/g, ' '));
  const accKeys = accClean.map(normAccount);
  if (new Set(accKeys).size !== accKeys.length) return null;
  const lines = [];
  const seen = new Set();
  let dr = 0, cr = 0;
  for (const l of raw) {
    if (!l || typeof l !== 'object' || !accountOk(l.account) || !SIDES.includes(l.side) || !amountOk(l.amount)) return null;
    const k = normAccount(l.account);
    const at = accKeys.indexOf(k);
    if (at < 0 || seen.has(`${l.side}:${k}`)) return null;
    seen.add(`${l.side}:${k}`);
    if (l.side === 'dr') dr += Math.round(l.amount * 100); else cr += Math.round(l.amount * 100);
    lines.push({ account: accClean[at], side: l.side, amount: l.amount });
  }
  if (dr !== cr || !dr) return null;
  let amounts = [];
  if (q.amounts !== undefined) {
    if (!Array.isArray(q.amounts) || q.amounts.length > JOURNAL_MAX_AMOUNTS || !q.amounts.every(amountOk)) return null;
    amounts = [...new Set(q.amounts.map(n => Math.round(n * 100) / 100))];
  }
  const rows = q.rows === undefined ? lines.length : q.rows;
  if (!Number.isInteger(rows) || rows < JOURNAL_MIN_LINES || rows > JOURNAL_MAX_LINES || rows < lines.length) return null;
  const accepts = {};
  if (q.accepts !== undefined && q.accepts !== null) {
    if (typeof q.accepts !== 'object' || Array.isArray(q.accepts)) return null;
    const entries = Object.entries(q.accepts);
    if (entries.length > JOURNAL_ACCEPTS_MAX) return null;
    for (const [alias, target] of entries) {
      if (!accountOk(alias) || !isStr(target)) return null;
      const t = accKeys.indexOf(normAccount(target));
      if (t < 0 || accKeys.includes(normAccount(alias))) return null;
      accepts[alias.trim().replace(/\s+/g, ' ')] = accClean[t];
    }
  }
  return { accounts: accClean, amounts, rows, lines, accepts };
}

// One line's sort key: debits first, then by account name.
const lineCmp = (a, b) => (a.side === b.side ? 0 : a.side === 'dr' ? -1 : b.side === 'dr' ? 1 : 0)
  || normAccount(a.account).localeCompare(normAccount(b.account))
  || (a.amount ?? 0) - (b.amount ?? 0);

// A user's account text as it may sit in the canonical string (no ";", one line, capped).
const cleanUserAccount = s => String(s ?? '').replace(/[;\r\n]/g, ',').replace(/\s+/g, ' ').trim().slice(0, JOURNAL_ACCOUNT_MAX);

/*
 * Canonical string of journal lines (answer lines or the user's rows). Each line is
 * { account, side: "dr"|"cr"|null, amount: number|null }; blank lines (no account, no amount) are
 * left out. Returns '' when nothing is left.
 */
export function serialiseJournal(lines) {
  const list = (Array.isArray(lines) ? lines : [])
    .map(l => ({ account: cleanUserAccount(l?.account), side: SIDES.includes(l?.side) ? l.side : null, amount: typeof l?.amount === 'number' && Number.isFinite(l.amount) ? l.amount : null }))
    .filter(l => l.account || l.amount !== null)
    .map(l => (l.amount === null ? { ...l, side: null } : l));
  list.sort((a, b) => (a.side === b.side ? 0 : a.side === null ? 1 : b.side === null ? -1 : 0) || lineCmp(a, b));
  return list.map(l => `${l.side === 'dr' ? 'Dr' : l.side === 'cr' ? 'Cr' : '?'} ${l.account || '?'} ${l.amount === null ? '?' : fmtAmountPlain(l.amount)}`).join('; ');
}

/*
 * Parses a canonical string back into lines [{ account, side, amount }] ('' account / null side or
 * amount for gaps). Returns null when the text isn't a journal string. Data only.
 */
export function parseJournal(str) {
  if (!isStr(str)) return null;
  const s = str.trim();
  if (!s) return [];
  const out = [];
  for (const part of s.split(';')) {
    const m = /^\s*(Dr|Cr|\?)\s+(.+?)\s+(\?|\d+(?:\.\d{1,2})?)\s*$/i.exec(part);
    if (!m) return null;
    const side = m[1].toLowerCase() === 'dr' ? 'dr' : m[1].toLowerCase() === 'cr' ? 'cr' : null;
    const account = m[2].trim() === '?' ? '' : m[2].trim();
    const amount = m[3] === '?' ? null : Number(m[3]);
    if (out.length >= 24) return null;
    out.push({ account, side, amount });
  }
  return out;
}

// The user's lines from an answer value: a canonical string, or an array of lines/rows.
function userLines(value) {
  if (Array.isArray(value)) {
    return value.map(l => ({
      account: String(l?.account ?? '').trim(),
      side: SIDES.includes(l?.side) ? l.side : null,
      amount: typeof l?.amount === 'number' && Number.isFinite(l.amount) ? l.amount : null,
    }));
  }
  return parseJournal(String(value ?? '')) ?? [];
}

const isBlank = l => !normAccount(l.account) && l.amount === null;

/*
 * Matches the user's lines to the answer lines, order-independent.
 * `spec` = { lines, accepts } (a live question carries both); `value` = canonical string or lines.
 * A user line matches an unmatched answer line with the same account (text rules, after the
 * question's `accepts` aliases), the same side, and an amount within 0.005. Duplicate user lines
 * are never merged: each can match one answer line, any other counts as an extra line.
 * Returns { correct, credit, matched, total, lines: [true|false|null per user line, null = blank] }.
 * credit = matched answer lines / max(answer lines, non-blank user lines); `correct` only when every
 * answer line is matched and there are no extra lines.
 */
export function gradeJournal(spec, value) {
  const answer = Array.isArray(spec?.lines) ? spec.lines : parseJournal(String(spec?.answer ?? '')) ?? [];
  const aliases = new Map();
  for (const [a, t] of Object.entries(spec?.accepts && typeof spec.accepts === 'object' ? spec.accepts : {})) aliases.set(normAccount(a), normAccount(t));
  const canon = s => { const k = normAccount(s); return aliases.get(k) ?? k; };
  const used = new Array(answer.length).fill(false);
  const mine = userLines(value);
  const marks = mine.map(l => {
    if (isBlank(l)) return null;
    if (!l.side || l.amount === null || !normAccount(l.account)) return false;
    const k = canon(l.account);
    const at = answer.findIndex((a, i) => !used[i] && normAccount(a.account) === k && a.side === l.side && Math.abs(a.amount - l.amount) <= AMOUNT_TOLERANCE);
    if (at < 0) return false;
    used[at] = true;
    return true;
  });
  const nonBlank = marks.filter(m => m !== null).length;
  const matched = used.filter(Boolean).length;
  const total = answer.length;
  const denom = Math.max(total, nonBlank);
  return { correct: total > 0 && matched === total && nonBlank === total, credit: denom ? matched / denom : 0, matched, total, lines: marks };
}

// Debit and credit totals of some lines (gaps and invalid amounts ignored).
export function journalTotals(lines) {
  let dr = 0, cr = 0;
  for (const l of Array.isArray(lines) ? lines : []) {
    if (typeof l?.amount !== 'number' || !Number.isFinite(l.amount)) continue;
    if (l.side === 'dr') dr += Math.round(l.amount * 100);
    else if (l.side === 'cr') cr += Math.round(l.amount * 100);
  }
  return { dr: dr / 100, cr: cr / 100 };
}
