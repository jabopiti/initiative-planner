const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

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

/** An ISO `YYYY-MM-DD` date as the date input shows it: "26.06.2026". */
export function formatDateField(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

/** A period as a headline reads it: the year once when both dates share it ("7 Sep – 30 Sep 2026"), else on both. */
export function formatPeriod(startIso: string, endIso: string): string {
  if (startIso.slice(0, 4) !== endIso.slice(0, 4)) return `${formatDate(startIso)} – ${formatDate(endIso)}`;
  return `${formatDate(startIso).replace(/ \d{4}$/, '')} – ${formatDate(endIso)}`;
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

/** "Sep 2026". */
export function formatMonth(key: string): string {
  const [y, m] = parseMonth(key);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "Sep 26", for a grid column. */
export function formatMonthShort(key: string): string {
  const [y, m] = parseMonth(key);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
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
      return `${sameYear ? MONTHS[parseMonth(first)[1] - 1] : formatMonth(first)} – ${formatMonth(last)}`;
    })
    .join(', ');
}

/** An ISO `YYYY-MM-DD` date in words for headlines and commit messages: "3 Sep 2026". */
export function formatDate(isoDate: string): string {
  const [y, m, d] = parseIso(isoDate);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Years a plan can sensibly name; a typo such as 1026 or 20266 is refused rather than costed month by month. */
const FIRST_YEAR = 2000;
const LAST_YEAR = 2100;

/** "26.06.2026" (or "3 Sep 2026", a longer month name, or ISO) to ISO; null when it isn't a real date in 2000 to 2100. */
export function parseDateText(text: string): string | null {
  const t = text.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (isoMatch) {
    const [y, m, d] = isoMatch.slice(1).map(Number);
    return isRealDate(y, m, d) ? iso(y, m, d) : null;
  }
  const numeric = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (numeric) {
    const [d, m, y] = numeric.slice(1).map(Number);
    return isRealDate(y, m, d) ? iso(y, m, d) : null;
  }
  const textMatch = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(t);
  if (!textMatch) return null;
  const word = textMatch[2].toLowerCase();
  const month = MONTH_NAMES.findIndex((name) => name === word || name.slice(0, 3) === word || (word === 'sept' && name === 'september')) + 1;
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
    month = MONTH_NAMES.findIndex((name) => name === word || name.slice(0, 3) === word || (word === 'sept' && name === 'september')) + 1;
    year = Number(words[2]);
  } else return null;
  if (month < 1 || month > 12 || year < FIRST_YEAR || year > LAST_YEAR) return null;
  return monthKey(year, month - 1);
}

/** The month names as the month popover lists them: "Jan" to "Dec". */
export const MONTH_ABBREVIATIONS: readonly string[] = MONTHS;
