const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** An ISO `YYYY-MM-DD` date as the date input shows it: "3 Sep 2026". */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "3 Sep 2026" (or a longer month name, or ISO) to ISO; null when it isn't a real date. */
export function parseDateText(text: string): string | null {
  const t = text.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (isoMatch) {
    const [y, m, d] = isoMatch.slice(1).map(Number);
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
