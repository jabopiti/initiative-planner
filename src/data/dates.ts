/** The English month abbreviations: the one fixed form, for commit messages in the shared history (§10.3). */
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** The locale a date, number or time is shown in (§9.7): the browser's, English when it reports none. */
export const displayLocale = (): string => (typeof navigator !== 'undefined' && navigator.language) || 'en';

const formatters = new Map<string, Intl.DateTimeFormat>();
/** A date format in a locale, made once per locale and options. Dates are read as UTC calendar days unless `timeZone` says otherwise. */
function dateFormat(locale: string, options: Intl.DateTimeFormatOptions, timeZone = 'UTC'): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  let format = formatters.get(key);
  if (!format) formatters.set(key, (format = new Intl.DateTimeFormat(locale, { ...options, timeZone })));
  return format;
}
const utc = (year: number, month: number, day = 1) => new Date(Date.UTC(year, month - 1, day));

/** Computed once per locale and kept. */
export function perLocale<T>(cache: Map<string, T>, locale: string, make: () => T): T {
  let value = cache.get(locale);
  if (value === undefined) cache.set(locale, (value = make()));
  return value;
}

const monthNames = new Map<string, string[]>();
/** The abbreviated month names in a locale, January first ("Sep" or "Sept", "Mai"). Shared: do not change it. */
export function shortMonths(locale = displayLocale()): readonly string[] {
  return perLocale(monthNames, locale, () => MONTHS_EN.map((_, i) => dateFormat(locale, { month: 'short' }).format(utc(2000, i + 1))));
}

const plain = (word: string) => word.toLowerCase().replace(/\.$/, '');

const monthWords = new Map<string, Map<string, number>>();
/** A month's number (1-12) from its name, its three-letter form or "sept" in English or the display locale; 0 when it is none of them. */
function monthFromWord(word: string): number {
  const english = MONTH_NAMES.findIndex((name) => name === word || name.slice(0, 3) === word || (word === 'sept' && name === 'september')) + 1;
  if (english) return english;
  const locale = displayLocale();
  const words = perLocale(monthWords, locale, () => {
    const lookup = new Map<string, number>();
    shortMonths(locale).forEach((name, i) => lookup.set(plain(name), i + 1));
    MONTH_NAMES.forEach((_, i) => lookup.set(plain(dateFormat(locale, { month: 'long' }).format(utc(2000, i + 1))), i + 1));
    return lookup;
  });
  return words.get(word) ?? 0;
}

const monthFirst = new Map<string, boolean>();
/** Whether the display locale's short numeric date puts the month before the day. */
function isMonthFirst(locale = displayLocale()): boolean {
  return perLocale(monthFirst, locale, () => {
    const order = dateFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
      .formatToParts(utc(2000, 2, 3))
      .map((part) => part.type);
    return order.indexOf('month') < order.indexOf('day');
  });
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (year < FIRST_YEAR || year > LAST_YEAR) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** The ISO `YYYY-MM-DD` date for a year, month (1-12) and day. */
export const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** `YYYY-MM` (§6 Month encoding). `month` is 0-based. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** An ISO `YYYY-MM-DD` date's year, month (1-12) and day. */
export const parseIso = (isoDate: string): [number, number, number] => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return [y, m, d];
};

/** A Date's calendar day in the user's local time, as `YYYY-MM-DD`. */
export const localIso = (d: Date) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());

/** Today's calendar date in the user's local time (§7.1, §5.11), as `YYYY-MM-DD`. */
export const localToday = (now: Date = new Date()) => localIso(now);

/** Whole calendar days from one ISO date to a later one (§8.1 Overrun); negative when `toIso` comes first. */
export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = parseIso(fromIso);
  const [ty, tm, td] = parseIso(toIso);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

/** An ISO `YYYY-MM-DD` date as the date input shows it, in the display locale's pattern: "26/06/2026", "26.06.2026". */
export function formatDateField(isoDate: string, locale = displayLocale()): string {
  const [y, m, d] = parseIso(isoDate);
  return dateFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(utc(y, m, d));
}

/** A period as a headline reads it: the year once when both dates share it ("7 Sep – 30 Sep 2026"), else on both. */
export function formatPeriod(startIso: string, endIso: string): string {
  const locale = displayLocale();
  const [sy, sm, sd] = parseIso(startIso);
  const [ey] = parseIso(endIso);
  if (sy !== ey) return `${formatDate(startIso, locale)} – ${formatDate(endIso, locale)}`;
  // The locale orders and punctuates day and month its own way, so the start's year is left out with Intl, not by cutting text.
  const withoutYear = dateFormat(locale, { day: 'numeric', month: 'short' }).format(utc(sy, sm, sd));
  return `${withoutYear} – ${formatDate(endIso, locale)}`;
}

/** A date's month as `YYYY-MM` (§6 Month encoding). */
export const monthOf = (isoDate: string) => isoDate.slice(0, 7);

/** A month key `YYYY-MM` as [year, month 1-12]. */
const parseMonth = (key: string): [number, number] => {
  const [y, m] = key.split('-').map(Number);
  return [y, m];
};

/** The month after a month key, by integer arithmetic (no date objects, so no day-31 overflow). */
export function nextMonth(key: string): string {
  const [y, m] = parseMonth(key);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** "Sep 2026" in English, "Sept 2026" and so on in the display locale. */
export function formatMonth(key: string, locale = displayLocale()): string {
  const [y, m] = parseMonth(key);
  return `${shortMonths(locale)[m - 1]} ${y}`;
}

/** The fixed English "Sep 2026", for commit messages (§10.3). */
export function formatMonthEn(key: string): string {
  const [y, m] = parseMonth(key);
  return `${MONTHS_EN[m - 1]} ${y}`;
}

/** The time of day in the display locale, in the user's own time zone: "14:20", "02:20 PM". */
export function formatClock(time: Date | number): string {
  return dateFormat(displayLocale(), { hour: '2-digit', minute: '2-digit' }, Intl.DateTimeFormat().resolvedOptions().timeZone).format(time);
}

/** "Sep 26", for a grid column. */
export function formatMonthShort(key: string): string {
  const [y, m] = parseMonth(key);
  return `${shortMonths()[m - 1]} ${String(y).slice(2)}`;
}

/** Consecutive months merged: "Sep 2026, Nov – Dec 2026, Jan – Feb 2027". Keys are ascending. */
export function formatMonthRanges(keys: string[]): string {
  const runs: string[][] = [];
  for (const key of keys) {
    const run = runs[runs.length - 1];
    if (run && nextMonth(run[run.length - 1]) === key) run.push(key);
    else runs.push([key]);
  }
  return runs
    .map((run) => {
      const first = run[0];
      const last = run[run.length - 1];
      if (first === last) return formatMonth(first);
      const sameYear = parseMonth(first)[0] === parseMonth(last)[0];
      return `${sameYear ? shortMonths()[parseMonth(first)[1] - 1] : formatMonth(first)} – ${formatMonth(last)}`;
    })
    .join(', ');
}

/** An ISO `YYYY-MM-DD` date in words for headlines, in the display locale: "3 Sept 2026", "Sep 3, 2026". */
export function formatDate(isoDate: string, locale = displayLocale()): string {
  const [y, m, d] = parseIso(isoDate);
  return dateFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(utc(y, m, d));
}

/** The fixed English "3 Sep 2026", for commit messages in the shared history (§10.3). */
export function formatDateEn(isoDate: string): string {
  const [y, m, d] = parseIso(isoDate);
  return `${d} ${MONTHS_EN[m - 1]} ${y}`;
}

/** Years a plan can sensibly name; a typo such as 1026 or 20266 is refused rather than costed month by month. */
export const FIRST_YEAR = 2000;
export const LAST_YEAR = 2100;

/** "26.06.2026" (or "3 Sep 2026", a longer month name, or ISO) to ISO; null when it isn't a real date in 2000 to 2100. */
export function parseDateText(text: string): string | null {
  const t = text.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (isoMatch) {
    const [y, m, d] = isoMatch.slice(1).map(Number);
    return isRealDate(y, m, d) ? iso(y, m, d) : null;
  }
  const yearFirst = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (yearFirst) {
    const [y, m, d] = yearFirst.slice(1).map(Number);
    return isRealDate(y, m, d) ? iso(y, m, d) : null;
  }
  const numeric = /^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/.exec(t);
  if (numeric) {
    // Dotted dates are day first everywhere; slashed and dashed ones follow the display locale's order.
    const [a, b, y] = [Number(numeric[1]), Number(numeric[3]), Number(numeric[4])];
    const [d, m] = numeric[2] !== '.' && isMonthFirst() ? [b, a] : [a, b];
    return isRealDate(y, m, d) ? iso(y, m, d) : null;
  }
  const textMatch = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(t);
  if (!textMatch) return null;
  const word = textMatch[2].toLowerCase();
  const month = monthFromWord(word);
  if (month === 0) return null;
  const [day, year] = [Number(textMatch[1]), Number(textMatch[3])];
  return isRealDate(year, month, day) ? iso(year, month, day) : null;
}

/** "Sep 2026" (or "September 2026", "2026-09", "09/2026", "9.2026") to a month key; null when it isn't a month in 2000 to 2100. */
export function parseMonthText(text: string): string | null {
  const t = text.trim();
  const numeric = /^(\d{4})-(\d{1,2})$/.exec(t);
  const reversed = /^(\d{1,2})[./](\d{4})$/.exec(t);
  const words = /^([A-Za-z]+)\.?\s+(\d{4})$/.exec(t);
  let year: number;
  let month: number;
  if (numeric) [year, month] = [Number(numeric[1]), Number(numeric[2])];
  else if (reversed) [month, year] = [Number(reversed[1]), Number(reversed[2])];
  else if (words) {
    const word = words[1].toLowerCase();
    month = monthFromWord(word);
    year = Number(words[2]);
  } else return null;
  if (month < 1 || month > 12 || year < FIRST_YEAR || year > LAST_YEAR) return null;
  return monthKey(year, month - 1);
}
