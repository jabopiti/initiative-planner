import { describe, expect, it } from 'vitest';
import { formatDate, formatDateField, formatPeriod, parseDateText } from './dates';

describe('date text (§9.11 date input)', () => {
  it('formats an ISO date for the field as dd.mm.yyyy, and for headlines as "3 Sep 2026"', () => {
    expect(formatDateField('2026-06-26')).toBe('26.06.2026');
    expect(formatDateField('2026-09-03')).toBe('03.09.2026');
    expect(formatDate('2026-09-03')).toBe('3 Sep 2026');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('shows the year once when a period stays inside one year, and twice when it crosses years', () => {
    expect(formatPeriod('2026-09-07', '2026-09-30')).toBe('7 Sep – 30 Sep 2026');
    expect(formatPeriod('2026-09-08', '2027-01-08')).toBe('8 Sep 2026 – 8 Jan 2027');
  });

  it('reads dd.mm.yyyy, and "3 Sep 2026" spellings and ISO too', () => {
    for (const text of ['03.09.2026', '3.9.2026', ' 03/09/2026 ', '3 Sep 2026', '03 sep 2026', '3 September 2026', '2026-09-03', '3 Sept 2026']) {
      expect(parseDateText(text)).toBe('2026-09-03');
    }
  });

  it('rejects text that is not a real date', () => {
    for (const text of ['', 'soon', '31 Feb 2026', '31.02.2026', '3 Foo 2026', '2026-13-01', '3 Sep', '26.06', '13.13.2026']) {
      expect(parseDateText(text)).toBeNull();
    }
  });
});
