import { afterEach, describe, expect, it } from 'vitest';
import { formatCompactAmount, formatAmount } from '../ui/formatAmount';
import { formatDate, formatDateEn, formatDateField, formatMonthEn, parseDateText } from './dates';

const setLanguage = (value: string) => Object.defineProperty(navigator, 'language', { value, configurable: true });

describe('display formats follow the browser locale (§9.7)', () => {
  afterEach(() => setLanguage('en-GB'));

  it('writes amounts, compact amounts and dates the German way in a German browser', () => {
    setLanguage('de-DE');
    expect(formatAmount(1234567, '€')).toBe('€1.234.567');
    expect(formatCompactAmount(395_000, '€')).toBe('€395k');
    expect(formatCompactAmount(1_234_000, '€')).toBe('€1,2M');
    expect(formatDateField('2026-06-26')).toBe('26.06.2026');
    expect(formatDate('2026-06-26')).toMatch(/^26\. Juni? 2026$/);
  });

  it('writes compact amounts without a space in English', () => {
    expect(formatCompactAmount(395_000, '€')).toBe('€395k');
    expect(formatCompactAmount(1_200_000, '€')).toBe('€1.2M');
  });

  it('reads a slashed date in the locale\'s order and a dotted one day first', () => {
    expect(parseDateText('03/09/2026')).toBe('2026-09-03');
    setLanguage('en-US');
    expect(parseDateText('09/03/2026')).toBe('2026-09-03');
    expect(parseDateText('03.09.2026')).toBe('2026-09-03');
  });

  it('keeps commit-message dates English in any browser', () => {
    setLanguage('de-DE');
    expect(formatDateEn('2026-09-03')).toBe('3 Sep 2026');
    expect(formatMonthEn('2026-09')).toBe('Sep 2026');
  });
});
