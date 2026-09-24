const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** The ISO `YYYY-MM-DD` date for a year, month (1-12) and day. */
export const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

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

/** An ISO `YYYY-MM-DD` date in words for headlines and commit messages: "3 Sep 2026". */
export function formatDate(isoDate: string): string {
  const [y, m, d] = parseIso(isoDate);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "26.06.2026" (or "3 Sep 2026", a longer month name, or ISO) to ISO; null when it isn't a real date. */
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
