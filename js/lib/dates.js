// Date and year parsing for date answers and year-mode numbers. Pure: no DOM, no storage.
//
// A parsed date is { year, month, day, precision }: `year` is a historical year (negative = BC,
// never 0), `month` 1-12 or null, `day` 1-31 or null, `precision` "year" | "month" | "day" (what
// was given). Numeric dates are read day first (20/7/1969 = 20 July 1969).
//
// Accepted: "1969", "44 BC", "AD 79", "79 AD", "July 1969", "Jul 1969", "7/1969", "1969-07",
// "20 July 1969", "July 20, 1969", "20th July 1969", "20th of July 1969", "20/7/1969",
// "20.7.1969", "20-7-1969", "1969-07-20". Separators: / - . space (and commas). All-numeric
// forms need a 3-4 digit year, so "20/7/69" is not read as a date.

export const PRECISIONS = ['year', 'month', 'day'];
const RANK = { year: 0, month: 1, day: 2 };

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const MONTH_WORDS = new Map();
MONTHS.forEach((m, i) => {
  MONTH_WORDS.set(m.toLowerCase(), i + 1);
  MONTH_WORDS.set(m.slice(0, 3).toLowerCase(), i + 1);
});
MONTH_WORDS.set('sept', 9);

export const isLeapYear = astro => (astro % 4 === 0 && astro % 100 !== 0) || astro % 400 === 0;
// Astronomical year: 1 BC = 0, 2 BC = -1, AD 1 = 1 (so arithmetic has no gap).
const astroOf = year => (year < 0 ? year + 1 : year);

export function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(astroOf(year)) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// True for a real calendar date (proleptic Gregorian; year never 0).
export function isValidDate(year, month, day) {
  if (!Number.isInteger(year) || year === 0 || Math.abs(year) > 9999) return false;
  if (month === null || month === undefined) return day === null || day === undefined;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (day === null || day === undefined) return true;
  return Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month);
}

// Splits off a leading/trailing era marker. -> { core, era: 'bc' | 'ad' | null }.
function splitEra(s) {
  let m = s.match(/^(?:a\.?\s?d\.?|c\.?\s?e\.?)\s*(.*)$/);
  if (m && m[1] && /^\d/.test(m[1])) return { core: m[1], era: 'ad' };
  m = s.match(/^(.*?)\s*(b\.?\s?c\.?\s?e?\.?|a\.?\s?d\.?|c\.?\s?e\.?)$/);
  if (m && m[1] && /\d$/.test(m[1])) return { core: m[1], era: /^b/.test(m[2]) ? 'bc' : 'ad' };
  return { core: s, era: null };
}

const make = (year, month, day) => {
  if (!isValidDate(year, month ?? null, day ?? null)) return null;
  return { year, month: month ?? null, day: day ?? null, precision: day ? 'day' : month ? 'month' : 'year' };
};
const toInt = t => (/^\d+$/.test(t) ? parseInt(t, 10) : NaN);

/*
 * Parses typed text into a date, or null when it isn't a (valid) date. BC/AD may be given at any
 * precision ("15 March 44 BC").
 */
export function parseDate(text) {
  let s = String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s || s.length > 60) return null;
  const { core, era } = splitEra(s);
  s = core.trim();
  const sign = y => (era === 'bc' ? -y : y);
  let m;
  // Year only.
  if ((m = s.match(/^(\d{1,4})$/))) return make(sign(toInt(m[1])), null, null);
  // ISO year-month(-day).
  if ((m = s.match(/^(\d{3,4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/))) {
    return make(sign(toInt(m[1])), toInt(m[2]), m[3] ? toInt(m[3]) : null);
  }
  // Day first: D/M/YYYY, and month/year: M/YYYY.
  if ((m = s.match(/^(\d{1,2})([-/. ])(\d{1,2})\2(\d{3,4})$/))) return make(sign(toInt(m[4])), toInt(m[3]), toInt(m[1]));
  if ((m = s.match(/^(\d{1,2})[-/. ](\d{3,4})$/))) return make(sign(toInt(m[2])), toInt(m[1]), null);
  // With a month name: tokens of words and numbers.
  const tokens = s.replace(/,/g, ' ').split(/[\s/\-.]+/).filter(Boolean)
    .map(t => t.replace(/^(\d{1,2})(st|nd|rd|th)$/, '$1'))
    .filter(t => t !== 'of' && t !== 'the');
  const months = tokens.filter(t => MONTH_WORDS.has(t));
  if (months.length !== 1) return null;
  const rest = tokens.filter(t => !MONTH_WORDS.has(t));
  if (rest.some(t => !/^\d{1,4}$/.test(t))) return null;
  const month = MONTH_WORDS.get(months[0]);
  if (rest.length === 1) {
    // "July 1969" (a 1-2 digit number alone is a day without a year: not a date).
    return rest[0].length >= 3 || era ? make(sign(toInt(rest[0])), month, null) : null;
  }
  if (rest.length === 2) {
    const [a, b] = rest;
    if (a.length <= 2 && (b.length >= 3 || era)) return make(sign(toInt(b)), month, toInt(a));
    if (a.length >= 3 && b.length <= 2) return make(sign(toInt(a)), month, toInt(b));
  }
  return null;
}

const yearText = y => (y < 0 ? `${-y} BC` : String(y));

// Canonical text: "1969", "44 BC", "July 1969", "20 July 1969". `precision` (optional) cuts detail.
export function formatDate(d, precision = d?.precision) {
  if (!d) return '';
  const p = RANK[precision] ?? RANK[d.precision] ?? 0;
  if (p >= 2 && d.day) return `${d.day} ${MONTHS[d.month - 1]} ${yearText(d.year)}`;
  if (p >= 1 && d.month) return `${MONTHS[d.month - 1]} ${yearText(d.year)}`;
  return yearText(d.year);
}

// True when the date gives at least `precision` detail.
export const hasPrecision = (d, precision) => !!d && (RANK[d.precision] ?? -1) >= (RANK[precision] ?? 9);

// "Give the month and year" etc. for an answer of `precision`.
export function precisionHint(precision) {
  return precision === 'day' ? 'Give the day, month and year' : precision === 'month' ? 'Give the month and year' : 'Give the year';
}

// Days from a fixed epoch (proleptic Gregorian, astronomical years).
function dayNumber(year, month, day) {
  const t = new Date(Date.UTC(2000, month - 1, day));
  t.setUTCFullYear(astroOf(year));
  return Math.round(t.getTime() / 86400000);
}

// Integer position of a date at `precision` (consecutive units differ by 1).
export function dateUnits(d, precision) {
  if (precision === 'day') return dayNumber(d.year, d.month, d.day);
  if (precision === 'month') return astroOf(d.year) * 12 + (d.month - 1);
  return astroOf(d.year);
}

// Units apart at `precision` (both dates must have that much detail), or NaN.
export function dateDistance(a, b, precision) {
  if (!hasPrecision(a, precision) || !hasPrecision(b, precision)) return NaN;
  return Math.abs(dateUnits(a, precision) - dateUnits(b, precision));
}

/*
 * A typed year as a number: "1969", "-44", "44 BC", "44 BCE", "AD 79", "79 AD", "79 CE".
 * Negative = BC. Plain integers (including 0 and negatives) pass through; an era marker needs a
 * year ≥ 1. NaN otherwise.
 */
export function parseYear(text) {
  const s = String(text ?? '').trim().toLowerCase().replace(/−/g, '-').replace(/\s+/g, ' ');
  if (/^-?\d{1,6}$/.test(s)) return parseInt(s, 10);
  const { core, era } = splitEra(s);
  if (!era || !/^\d{1,4}$/.test(core.trim())) return NaN;
  const y = parseInt(core, 10);
  if (y < 1) return NaN;
  return era === 'bc' ? -y : y;
}

// Years apart with no year 0: 1 BC (-1) to AD 1 (1) is 1 year.
export function yearDistance(a, b) {
  const d = Math.abs(a - b);
  return a * b < 0 ? d - 1 : d;
}
