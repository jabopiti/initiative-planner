import { displayLocale } from './dates';

/** The largest amount an entry may come to (§9.11): far above any budget, and far inside what a stored number holds exactly. */
const MAX_AMOUNT = 1_000_000_000_000n;
/** An entry longer than this is not an amount; it also keeps the exact arithmetic small. */
const MAX_LENGTH = 120;

export type AmountReason = 'empty' | 'unreadable' | 'divideByZero' | 'negative' | 'tooLarge';

export type AmountEntry =
  | { ok: true; value: number; /** The entry is one plain number, with no suffix, operator or bracket: nothing to explain before it saves. */ plain: boolean }
  | { ok: false; reason: AmountReason };

/** The refusal shown on commit (§9.11); an empty entry gets the field's own text, which names what it holds (a day rate). */
export function amountRefusal(reason: AmountReason, emptyText: string): string {
  switch (reason) {
    case 'empty':
      return emptyText;
    case 'divideByZero':
      return "Can't divide by 0.";
    case 'negative':
      return "An amount can't be below 0.";
    case 'tooLarge':
      return 'That amount is too large.';
    default:
      return "Can't read that as an amount. Try 12k or 3 × 4k.";
  }
}

/** An exact fraction: amounts are computed with integers, never floats (§9.11), so 0.1 + 0.2 is exactly 0.3. */
interface Fraction {
  n: bigint;
  d: bigint; // always > 0
}

const fraction = (n: bigint, d: bigint): Fraction => (d < 0n ? { n: -n, d: -d } : { n, d });
const add = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Fraction, b: Fraction) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d);

/** A refusal thrown out of the recursive descent. */
class Refused extends Error {
  constructor(readonly reason: AmountReason) {
    super(reason);
  }
}

const separators = new Map<string, { decimal: string; group: string }>();
/** The locale's decimal and group separators (§9.7). */
function localeSeparators(locale: string): { decimal: string; group: string } {
  let found = separators.get(locale);
  if (!found) {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    found = {
      decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
      group: parts.find((p) => p.type === 'group')?.value ?? ',',
    };
    separators.set(locale, found);
  }
  return found;
}

const isDigit = (c: string | undefined): c is string => c !== undefined && c >= '0' && c <= '9';
const isSpace = (c: string) => /\s/.test(c);

/**
 * Reads one number's text (digits and the separators `.`, `,` and the locale's group mark) into a fraction. The
 * locale's decimal is the decimal; several of one mark, or marks of two kinds, put the decimal last. A single mark
 * that is not the locale's decimal is a group when exactly three digits follow it ("12,000" in English), and
 * otherwise read as the decimal too, so "1.5k" is 1,500 in every locale (§9.11).
 */
function numberValue(raw: string, decimal: string): Fraction {
  const marks = [...raw].filter((c) => !isDigit(c));
  let integer = raw;
  let fractionDigits = '';
  if (marks.length > 0) {
    const kinds = new Set(marks);
    const lastAt = raw.search(/\D\d*$/);
    const last = raw[lastAt];
    const after = raw.slice(lastAt + 1);
    const lead = raw.split(/\D/)[0];
    const decimalLast =
      kinds.size > 1 ? true : marks.length > 1 ? false : last === decimal || after.length !== 3 || lead.length === 0 || lead.length > 3 || lead === '0';
    if (decimalLast) {
      integer = raw.slice(0, lastAt);
      fractionDigits = after;
    }
    const groupMarks = [...integer].filter((c) => !isDigit(c));
    if (groupMarks.length > 0) {
      const chunks = integer.split(/\D/);
      const [first, ...rest] = chunks;
      const groupsOk = new Set(groupMarks).size === 1 && first.length >= 1 && first.length <= 3 && rest.every((chunk) => chunk.length === 3);
      if (!groupsOk) throw new Refused('unreadable');
    }
    integer = integer.replace(/\D/g, '');
  }
  if (integer === '' && fractionDigits === '') throw new Refused('unreadable');
  return fraction(BigInt(integer + fractionDigits), 10n ** BigInt(fractionDigits.length));
}

/**
 * Reads what a user typed in an amount field (§9.11): a number in the display locale's format, `k` and `m`
 * suffixes (12k, 2.5m), `+ − × /` between numbers (`-`, `x` and `*` too), brackets and a leading currency symbol.
 * A hand-written parser, never `eval` (§10.9); the sum is exact and rounded to whole cents only at the end.
 * An amount is 0 or more: the result is refused below 0 or above 1,000,000,000,000.
 */
export function parseAmountExpression(text: string, locale = displayLocale()): AmountEntry {
  const input = text.trim().replace(/^\p{Sc}\s*/u, '');
  if (input === '') return { ok: false, reason: 'empty' };
  if (input.length > MAX_LENGTH) return { ok: false, reason: 'unreadable' };
  const { decimal, group } = localeSeparators(locale);
  const groupIsSpace = isSpace(group);
  let at = 0;
  let operations = 0;

  const skip = () => {
    while (at < input.length && isSpace(input[at])) at++;
  };
  const eat = (...chars: string[]) => {
    skip();
    const c = input[at];
    if (c !== undefined && chars.includes(c)) {
      at++;
      return c;
    }
    return null;
  };
  /** One number's text: digits, `.` and `,` beside a digit, and the locale's group mark between a digit and exactly three more. */
  const number = (): Fraction => {
    const start = at;
    let raw = '';
    while (at < input.length) {
      const c = input[at];
      const thousands = at > start && isDigit(input[at - 1]) && /^\d{3}(?!\d)/.test(input.slice(at + 1));
      if (isDigit(c)) raw += c;
      else if ((c === '.' || c === ',') && (isDigit(input[at - 1]) || isDigit(input[at + 1]))) raw += c;
      else if (c === group && thousands) raw += c;
      else if (groupIsSpace && isSpace(c) && thousands) raw += ' ';
      else break;
      at++;
    }
    if (raw === '') throw new Refused('unreadable');
    return numberValue(raw, decimal);
  };

  const suffix = (value: Fraction): Fraction => {
    const c = input[at]?.toLowerCase();
    if (c === 'k' || c === 'm') {
      at++;
      operations++;
      return mul(value, fraction(c === 'k' ? 1000n : 1_000_000n, 1n));
    }
    return value;
  };

  const factor = (): Fraction => {
    skip();
    if (eat('-', '−', '–')) {
      operations++;
      const inner = factor();
      return fraction(-inner.n, inner.d);
    }
    if (eat('(')) {
      operations++;
      const inner = expression();
      if (!eat(')')) throw new Refused('unreadable');
      return suffix(inner);
    }
    return suffix(number());
  };

  const term = (): Fraction => {
    let value = factor();
    for (;;) {
      const op = eat('×', 'x', 'X', '*', '/', '÷');
      if (!op) return value;
      operations++;
      const right = factor();
      if (op === '/' || op === '÷') {
        if (right.n === 0n) throw new Refused('divideByZero');
        value = mul(value, fraction(right.d, right.n));
      } else value = mul(value, right);
    }
  };

  const expression = (): Fraction => {
    let value = term();
    for (;;) {
      const op = eat('+', '-', '−', '–');
      if (!op) return value;
      operations++;
      const right = term();
      value = op === '+' ? add(value, right) : sub(value, right);
    }
  };

  try {
    const result = expression();
    skip();
    if (at < input.length) return { ok: false, reason: 'unreadable' };
    if (result.n < 0n) return { ok: false, reason: 'negative' };
    if (result.n > MAX_AMOUNT * result.d) return { ok: false, reason: 'tooLarge' };
    const cents = (result.n * 200n + result.d) / (result.d * 2n); // half up, to whole cents
    return { ok: true, value: Number(cents) / 100, plain: operations === 0 };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.reason };
    throw error;
  }
}
