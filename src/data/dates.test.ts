import { describe, expect, it } from 'vitest';
import { formatDate, formatDateField, formatMonth, formatMonthRanges, formatMonthShort, formatPeriod, nextMonth, parseDateText, parseMonthText } from './dates';

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

  it('refuses years outside 2000 to 2100, so a typo is not stored or costed month by month', () => {
    for (const text of ['01.01.0999', '30.06.1026', '01.01.9999', '1999-12-31', '3 Sep 2101']) {
      expect(parseDateText(text)).toBeNull();
    }
    expect(parseDateText('01.01.2000')).toBe('2000-01-01');
    expect(parseDateText('31.12.2100')).toBe('2100-12-31');
  });

  it('rejects text that is not a real date', () => {
    for (const text of ['', 'soon', '31 Feb 2026', '31.02.2026', '3 Foo 2026', '2026-13-01', '3 Sep', '26.06', '13.13.2026']) {
      expect(parseDateText(text)).toBeNull();
    }
  });
});

describe('month helpers', () => {
  it('formats a month key', () => {
    expect(formatMonth('2026-09')).toBe('Sep 2026');
    expect(formatMonthShort('2026-09')).toBe('Sep 26');
  });
  it('steps to the next month across a year end', () => {
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(nextMonth('2026-09')).toBe('2026-10');
  });
  it('merges consecutive months into ranges', () => {
    expect(formatMonthRanges(['2026-11', '2026-12', '2027-01'])).toBe('Nov 2026 – Jan 2027');
    expect(formatMonthRanges(['2026-09', '2026-11', '2026-12'])).toBe('Sep 2026, Nov – Dec 2026');
    expect(formatMonthRanges(['2026-09'])).toBe('Sep 2026');
  });
});

describe('month text (§9.11 month input)', () => {
  it('reads "Sep 2026" and the other spellings of a month', () => {
    for (const text of ['Sep 2026', 'september 2026', 'Sept 2026', '2026-09', '09/2026', '9.2026', ' Sep  2026 ']) {
      expect(parseMonthText(text), text).toBe('2026-09');
    }
  });

  it('refuses what is not a month, or a year nobody plans in', () => {
    for (const text of ['', 'Sep', '2026', 'Foo 2026', '13/2026', '0/2026', 'Sep 1026', 'Sep 20266']) {
      expect(parseMonthText(text), text).toBeNull();
    }
  });
});
